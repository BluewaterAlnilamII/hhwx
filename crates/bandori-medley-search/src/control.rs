use crate::MedleySearchSolutionV1;

/// A caller-observed request to stop an in-progress search.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SearchStopReason {
    Cancelled,
    TimedOut,
}

/// Platform-independent resource controls for one search run.
///
/// The caller owns its clock and cancellation source. The single-threaded
/// search polls `stop_check` at safe points instead of depending on a native or
/// browser-specific timer API.
pub struct SearchControl<'a> {
    memory_budget_bytes: usize,
    stop_check: &'a mut dyn FnMut() -> Option<SearchStopReason>,
    strict_improvement: Option<&'a mut dyn FnMut(&MedleySearchSolutionV1)>,
}

impl<'a> SearchControl<'a> {
    pub fn new(
        memory_budget_bytes: usize,
        stop_check: &'a mut dyn FnMut() -> Option<SearchStopReason>,
    ) -> Self {
        Self {
            memory_budget_bytes,
            stop_check,
            strict_improvement: None,
        }
    }

    /// Report the first feasible solution and later strictly higher totals.
    pub fn with_strict_improvement(
        mut self,
        strict_improvement: &'a mut dyn FnMut(&MedleySearchSolutionV1),
    ) -> Self {
        self.strict_improvement = Some(strict_improvement);
        self
    }

    pub const fn memory_budget_bytes(&self) -> usize {
        self.memory_budget_bytes
    }

    pub fn poll_stop(&mut self) -> Option<SearchStopReason> {
        (self.stop_check)()
    }

    pub(crate) fn report_strict_improvement(&mut self, solution: &MedleySearchSolutionV1) {
        if let Some(callback) = &mut self.strict_improvement {
            callback(solution);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn control_preserves_budget_and_caller_stop_reason() {
        let mut calls = 0_u8;
        let mut stop_check = || {
            calls += 1;
            (calls == 2).then_some(SearchStopReason::TimedOut)
        };
        let mut control = SearchControl::new(4096, &mut stop_check);

        assert_eq!(control.memory_budget_bytes(), 4096);
        assert_eq!(control.poll_stop(), None);
        assert_eq!(control.poll_stop(), Some(SearchStopReason::TimedOut));
    }
}
