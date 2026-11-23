import Std

/-!
Mathematical suffix recurrence for the single-song score and bonus-bin
bounds. One group contains the available choices for one character. A card
can contribute distinct ordinary and leader entries with their respective skill
coefficients. An ineligible role has no entry. Taking one entry skips the
entire group, so two instances of the same character can never be selected.

Weights are nonnegative integers in fixed units. One table can store power,
another skill coefficient or a correlated linear metric. These proofs concern
the recurrence and final product inequality; they do not establish Rust's
outward rounding or derive the weight of a card from the note scorer.
-/
namespace Bandori.Single.Bounds

/-- Times are exact nonnegative ticks with a common unit. The wait is 0.75s
    in the single-song model; monotonicity holds for any fixed wait. -/
def queueStart (trigger duration : Nat → Nat) (wait : Nat) : Nat → Nat
  | 0 => trigger 0
  | w + 1 => max (trigger (w+1)) (queueStart trigger duration wait w + duration w + wait)

theorem queueStart_le_latest (trigger duration : Nat → Nat) (wait longest : Nat)
    (hd : ∀ i, duration i ≤ longest) (w : Nat) :
    queueStart trigger duration wait w ≤ queueStart trigger (fun _ => longest) wait w := by
  induction w with
  | zero => exact Nat.le_refl _
  | succ i ih =>
    have := hd i
    simp only [queueStart]
    omega

private def sumOver (xs : List α) (value : α → Nat) : Nat := (xs.map value).sum

private theorem sum_le_each (xs : List α) (f g : α → Nat) (h : ∀ x ∈ xs, f x ≤ g x) :
    sumOver xs f ≤ sumOver xs g := by
  induction xs with
  | nil => exact Nat.le_refl _
  | cons x xs ih =>
    exact Nat.add_le_add (h x (.head _)) (ih fun a ha => h a (.tail _ ha))

/-- The exact note interval includes both time endpoints and excludes every
    note at or before the original trigger index. The envelope admits notes
    between trigger and delayed start, matching the Rust window sum. -/
theorem queued_window_sum_le (notes : List Nat) (time trigger duration : Nat → Nat)
    (wait longest w triggerIndex durationHi : Nat) (actual upper : Nat → Nat)
    (hd : ∀ i, duration i ≤ longest) (hw : duration w ≤ durationHi)
    (hNote : ∀ i ∈ notes, actual i ≤ upper i) :
    let start := queueStart trigger duration wait w
    let latest := queueStart trigger (fun _ => longest) wait w
    sumOver notes (fun i => if triggerIndex < i ∧ start ≤ time i ∧
        time i ≤ start + duration w then actual i else 0) ≤
      sumOver notes (fun i => if triggerIndex < i ∧ time i ≤ latest + durationHi
        then upper i else 0) := by
  dsimp only
  apply sum_le_each
  intro i hi
  split
  next h =>
    have hStart := queueStart_le_latest trigger duration wait longest hd w
    rw [if_pos (show triggerIndex < i ∧ time i ≤
      queueStart trigger (fun _ => longest) wait w + durationHi by omega)]
    exact hNote i hi
  next => exact Nat.zero_le _

/-- If the base note has coefficient alpha/aDen and its extra multiplier
    is delta/dDen, both successive floors are bounded by the unrounded
    nonnegative product. All comparisons use exact common units. -/
theorem staged_note_bounds (power alpha aDen delta dDen : Nat) :
    let inner := power * alpha / aDen
    let extra := inner * (dDen + delta) / dDen - inner
    inner * aDen ≤ power * alpha ∧ extra * dDen * aDen ≤ power * alpha * delta := by
  let inner := power * alpha / aDen
  let boosted := inner * (dDen + delta) / dDen
  change inner * aDen ≤ power * alpha ∧
    (boosted - inner) * dDen * aDen ≤ power * alpha * delta
  have hBase : inner * aDen ≤ power * alpha := Nat.div_mul_le_self _ _
  have hBoost : boosted * dDen ≤ inner * (dDen + delta) := Nat.div_mul_le_self _ _
  rw [Nat.mul_add] at hBoost
  have hExtra : (boosted - inner) * dDen ≤ inner * delta := by
    rw [Nat.sub_mul]
    omega
  exact ⟨hBase, calc
    (boosted - inner) * dDen * aDen ≤ inner * delta * aDen := Nat.mul_le_mul_right _ hExtra
    _ = inner * aDen * delta := by ac_rfl
    _ ≤ power * alpha * delta := Nat.mul_le_mul_right _ hBase⟩

private def maximum : List Nat → Nat
  | [] => 0
  | x :: xs => max x (maximum xs)

private theorem member_le_maximum {x : Nat} {xs : List Nat} (h : x ∈ xs) :
    x ≤ maximum xs := by
  induction xs with
  | nil => simp at h
  | cons y ys ih =>
    rcases List.mem_cons.mp h with he | ht
    · subst x; exact Nat.le_max_left _ _
    · exact Nat.le_trans (ih ht) (Nat.le_max_right _ _)

/-- The contribution at an actor's actual position is bounded by choosing
    its best position independently of all other actors. The weights are
    the order-distribution marginal counts, before division by 1024. -/
theorem position_relaxation (actors : List α) (windows positions : List Nat)
    (weight : Nat → Nat → Nat) (value ceiling : α → Nat → Nat) (position : α → Nat)
    (hp : ∀ a ∈ actors, position a ∈ positions)
    (hv : ∀ a ∈ actors, ∀ w ∈ windows, value a w ≤ ceiling a w) :
    sumOver actors (fun a => sumOver windows (fun w => weight w (position a) * value a w)) ≤
    sumOver actors (fun a => maximum (positions.map (fun p =>
      sumOver windows (fun w => weight w p * ceiling a w)))) := by
  apply sum_le_each
  intro a ha
  apply Nat.le_trans (m := sumOver windows (fun w => weight w (position a) * ceiling a w))
  · exact sum_le_each windows _ _ fun w hw => Nat.mul_le_mul_left _ (hv a ha w hw)
  · apply member_le_maximum
    exact List.mem_map.mpr ⟨position a, hp a ha, rfl⟩

structure Entry where
  leader : Bool
  bin : Nat
  weight : Nat

def leaderCount (entry : Entry) : Nat := if entry.leader then 1 else 0

/-- Exact choices, independent of the DP: skip a character or pick one entry. -/
inductive Completion : List (List Entry) → Nat → Nat → Nat → Nat → Prop where
  | empty : Completion [] 0 0 0 0
  | skip {groups k leaders bin weight} (group : List Entry)
      (tail : Completion groups k leaders bin weight) :
      Completion (group :: groups) k leaders bin weight
  | select {group groups k leaders bin weight} (entry : Entry) (mem : entry ∈ group)
      (tail : Completion groups k leaders bin weight) :
      Completion (group :: groups) (k + 1) (leaders + leaderCount entry)
        (bin + entry.bin) (weight + entry.weight)

private def maxOption : Option Nat → Option Nat → Option Nat
  | none, b => b
  | a, none => a
  | some a, some b => some (max a b)

private def bestOver (value : Entry → Option Nat) (initial : Option Nat) :
    List Entry → Option Nat
  | [] => initial
  | e :: es => maxOption (value e) (bestOver value initial es)

abbrev Table := Nat → Nat → Nat → Option Nat

private def takeEntry (tail : Table) (k leaders bin : Nat) (e : Entry) : Option Nat :=
  if 0 < k ∧ leaderCount e ≤ leaders ∧ e.bin ≤ bin then
    (tail (k - 1) (leaders - leaderCount e) (bin - e.bin)).map (· + e.weight)
  else none

/-- Keep the value obtained by skipping, then maximize over legal take
    transitions from the *next* character's table, as in the Rust suffix DP. -/
def suffix : List (List Entry) → Table
  | [], k, leaders, bin => if k = 0 ∧ leaders = 0 ∧ bin = 0 then some 0 else none
  | group :: groups, k, leaders, bin =>
    bestOver (takeEntry (suffix groups) k leaders bin) (suffix groups k leaders bin) group

def Covers (weight : Nat) : Option Nat → Prop
  | none => False
  | some top => weight ≤ top

private theorem max_left {w : Nat} {a b : Option Nat} (h : Covers w a) :
    Covers w (maxOption a b) := by
  cases a <;> cases b <;> simp_all [maxOption, Covers] <;> omega

private theorem max_right {w : Nat} {a b : Option Nat} (h : Covers w b) :
    Covers w (maxOption a b) := by
  cases a <;> cases b <;> simp_all [maxOption, Covers] <;> omega

private theorem covers_skip (value : Entry → Option Nat) {initial : Option Nat}
    {w : Nat} (h : Covers w initial) (group : List Entry) :
    Covers w (bestOver value initial group) := by
  induction group with
  | nil => exact h
  | cons _ _ ih => exact max_right ih

private theorem covers_choice {value : Entry → Option Nat} {initial : Option Nat}
    {w : Nat} {group : List Entry} {e : Entry} (hm : e ∈ group) (h : Covers w (value e)) :
    Covers w (bestOver value initial group) := by
  induction group with
  | nil => simp at hm
  | cons x xs ih =>
    rcases List.mem_cons.mp hm with he | ht
    · subst x
      exact max_left h
    · exact max_right (ih ht)

private theorem covers_add {w : Nat} {v : Option Nat} (inc : Nat) (h : Covers w v) :
    Covers (w + inc) (v.map (· + inc)) := by
  cases v <;> simp_all [Covers] <;> omega

theorem suffix_covers {groups k leaders bin weight}
    (h : Completion groups k leaders bin weight) :
    Covers weight (suffix groups k leaders bin) := by
  induction h with
  | empty => simp [suffix, Covers]
  | skip group _ ih => exact covers_skip _ ih group
  | select e hm _ ih =>
    apply covers_choice hm
    simpa [takeEntry] using covers_add e.weight ih

theorem none_is_impossible {groups k leaders bin}
    (h : suffix groups k leaders bin = none) (weight : Nat) :
    ¬ Completion groups k leaders bin weight := by
  intro hc
  have covered := suffix_covers hc
  rw [h] at covered
  exact covered

/-- Exact upward 1/32 binning for a rate with positive denominator. -/
def bonusBin (num den : Nat) : Nat := (32 * num + den - 1) / den

theorem bonusBin_covers (num den : Nat) (hd : 0 < den) :
    32 * num ≤ bonusBin num den * den := by
  have hmod := Nat.mod_lt (32 * num + den - 1) hd
  have hdiv := Nat.mod_add_div (32 * num + den - 1) den
  rw [Nat.mul_comm (bonusBin num den) den]
  unfold bonusBin
  omega

theorem sum_bonusBins_cover (rates : List Nat) (den : Nat) (hd : 0 < den) :
    32 * rates.sum ≤ (rates.map (fun n => bonusBin n den)).sum * den := by
  induction rates with
  | nil => simp
  | cons x xs ih =>
    simp only [List.map_cons, List.sum_cons, Nat.mul_add, Nat.add_mul]
    exact Nat.add_le_add (bonusBin_covers x den hd) ih

theorem independent_product {p k pHi kHi : Nat} (hp : p ≤ pHi) (hk : k ≤ kHi) :
    p * k ≤ pHi * kHi := Nat.mul_le_mul hp hk

/-- A completion has a power realization and a coefficient realization in
    the same character/count/bonus bin. Their maxima may come from different
    completions; adding the fixed prefix and multiplying is still safe. -/
theorem binned_product {powerGroups skillGroups count leaders bin p k pHi kHi}
    (power : Completion powerGroups count 0 bin p)
    (skill : Completion skillGroups count leaders bin k)
    (hp : suffix powerGroups count 0 bin = some pHi)
    (hk : suffix skillGroups count leaders bin = some kHi)
    (prefixPower prefixSkill : Nat) :
    (prefixPower + p) * (prefixSkill + k) ≤
      (prefixPower + pHi) * (prefixSkill + kHi) := by
  have h₁ := suffix_covers power
  have h₂ := suffix_covers skill
  rw [hp] at h₁
  rw [hk] at h₂
  exact independent_product (Nat.add_le_add_left h₁ _) (Nat.add_le_add_left h₂ _)

private theorem four_product_le_square (x y : Nat) :
    4 * (x * y) ≤ (x + y) * (x + y) := by
  rcases Nat.le_total x y with h | h
  · obtain ⟨d, rfl⟩ := Nat.exists_eq_add_of_le h
    simp only [Nat.add_mul, Nat.mul_add, Nat.mul_comm d x]
    omega
  · obtain ⟨d, rfl⟩ := Nat.exists_eq_add_of_le h
    simp only [Nat.add_mul, Nat.mul_add, Nat.mul_comm d y]
    omega

/-- For t = a/b with positive a,b, the linear metric tP + K/t can be
    bounded using integer units a²P + b²K. Compare the scaled square
    directly. Neither division nor a square root is needed in the theorem. -/
theorem correlated_product (a b p k limit : Nat) (h : a*a*p + b*b*k ≤ limit) :
    4 * (a*b) * (a*b) * (p*k) ≤ limit * limit := by
  calc
    4 * (a*b) * (a*b) * (p*k) = 4 * ((a*a*p) * (b*b*k)) := by ac_rfl
    _ ≤ (a*a*p + b*b*k) * (a*a*p + b*b*k) := four_product_le_square _ _
    _ ≤ limit * limit := Nat.mul_le_mul h h

end Bandori.Single.Bounds
