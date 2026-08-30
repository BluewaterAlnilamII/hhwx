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
}

impl<'a> SearchControl<'a> {
    pub fn new(
        memory_budget_bytes: usize,
        stop_check: &'a mut dyn FnMut() -> Option<SearchStopReason>,
    ) -> Self {
        Self {
            memory_budget_bytes,
            stop_check,
        }
    }

    pub const fn memory_budget_bytes(&self) -> usize {
        self.memory_budget_bytes
    }

    pub fn poll_stop(&mut self) -> Option<SearchStopReason> {
        (self.stop_check)()
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
