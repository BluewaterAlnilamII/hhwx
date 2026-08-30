/// Generate all 5! member-index orders in stable lexicographic order.
pub(crate) fn skill_orders() -> Vec<[usize; 5]> {
    fn visit(
        depth: usize,
        current: &mut [usize; 5],
        used: &mut [bool; 5],
        result: &mut Vec<[usize; 5]>,
    ) {
        if depth == current.len() {
            result.push(*current);
            return;
        }
        for member_index in 0..5 {
            if used[member_index] {
                continue;
            }
            used[member_index] = true;
            current[depth] = member_index;
            visit(depth + 1, current, used, result);
            used[member_index] = false;
        }
    }

    let mut result = Vec::with_capacity(120);
    visit(0, &mut [0; 5], &mut [false; 5], &mut result);
    debug_assert_eq!(result.len(), 120);
    result
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use super::*;

    #[test]
    fn produces_the_fixed_lexicographic_120_orders() {
        let orders = skill_orders();
        assert_eq!(orders.len(), 120);
        assert_eq!(orders.first(), Some(&[0, 1, 2, 3, 4]));
        assert_eq!(orders.last(), Some(&[4, 3, 2, 1, 0]));

        let mut member_position_counts = [[0_usize; 5]; 5];
        for order in &orders {
            let mut members = *order;
            members.sort_unstable();
            assert_eq!(members, [0, 1, 2, 3, 4]);
            for (position, member) in order.iter().copied().enumerate() {
                member_position_counts[member][position] += 1;
            }
        }
        assert_eq!(orders.iter().copied().collect::<BTreeSet<_>>().len(), 120);
        assert!(
            member_position_counts
                .into_iter()
                .flatten()
                .all(|count| count == 24)
        );
    }
}
