import Std

/-!
Mission support for a fixed main team. Powers are nonnegative numerators in
one common unit; a positive common denominator may represent fractional power.
Only an instance ID is excluded by membership in the main team.
-/
namespace Bandori.Single.Support

structure Card where
  instanceId : Nat
  character : Nat
  power : Nat
  excluded : Bool
  deriving DecidableEq

def eligible (main : List Nat) (card : Card) : Bool :=
  !card.excluded && !main.contains card.instanceId

def total (cards : List Card) : Nat := (cards.map Card.power).sum

private def totalBy (value : Nat → Nat) (xs : List Card) : Nat :=
  (xs.map (fun c => value c.power)).sum

private theorem total_perm (value : Nat → Nat) {xs ys : List Card} (perm : xs.Perm ys) :
    totalBy value xs = totalBy value ys := by
  induction perm with
  | nil => rfl
  | cons _ _ ih => simp_all [totalBy]
  | swap => simp [totalBy, Nat.add_left_comm]
  | trans _ _ ih₁ ih₂ => exact ih₁.trans ih₂

/-- Higher power first, then the smaller instance ID, as in the calculator. -/
def ahead (a b : Card) : Bool :=
  decide (b.power < a.power ∨ (b.power = a.power ∧ a.instanceId ≤ b.instanceId))

private theorem ahead_power {a b : Card} (h : ahead a b) : b.power ≤ a.power := by
  simp [ahead] at h
  omega

private theorem sorted (xs : List Card) : (xs.mergeSort ahead).Pairwise (fun a b => ahead a b) := by
  apply List.sorted_mergeSort
  · intro a b c
    simp only [ahead, decide_eq_true_eq]
    omega
  · intro a b
    simp [ahead]
    omega

def otherCharacter (card : Card) (xs : List Card) : List Card :=
  xs.filter (fun x => decide (x.character ≠ card.character))

@[simp] private theorem mem_other {a b : Card} {xs : List Card} :
    b ∈ otherCharacter a xs ↔ b ∈ xs ∧ b.character ≠ a.character := by
  simp [otherCharacter]

/-- In priority order, the first card of each character is its best eligible
    representative. Taking representatives in this order gives the top group
    winners without constructing separate character buckets. -/
def pick : Nat → List Card → List Card
  | 0, _ => []
  | _ + 1, [] => []
  | k + 1, a :: rest => a :: pick k (otherCharacter a rest)

/-- Retain the highest-priority card of every remaining character. -/
def representatives : (xs : List Card) → List Card
  | [] => []
  | a :: rest => a :: representatives (otherCharacter a rest)
termination_by xs => xs.length
decreasing_by
  have := List.length_filter_le (fun x : Card => decide (x.character ≠ a.character)) rest
  simp only [otherCharacter, List.length_cons]
  omega

theorem take_representatives (k : Nat) (xs : List Card) :
    (representatives xs).take k = pick k xs := by
  induction k generalizing xs with
  | zero => simp [pick]
  | succ k ih =>
    cases xs with
    | nil => simp [representatives, pick]
    | cons a rest => simp [representatives, pick, ih]

/-- Every eligible character has a representative of at least the power of
    each of its eligible cards, even if fewer than five characters survive. -/
theorem representatives_cover (xs : List Card)
    (order : xs.Pairwise (fun a b => ahead a b)) {rival : Card} (hr : rival ∈ xs) :
    ∃ card ∈ representatives xs, card.character = rival.character ∧ rival.power ≤ card.power := by
  induction xs using representatives.induct with
  | case1 => simp at hr
  | case2 a rest ih =>
    obtain ⟨first, tail⟩ := List.pairwise_cons.mp order
    by_cases same : a.character = rival.character
    · refine ⟨a, by simp [representatives], same, ?_⟩
      rcases List.mem_cons.mp hr with rfl | hr
      · exact Nat.le_refl _
      · exact ahead_power (first _ hr)
    · have ht : rival ∈ rest := (List.mem_cons.mp hr).resolve_left (fun h => same (h ▸ rfl))
      have mem := mem_other.mpr ⟨ht, Ne.symm same⟩
      obtain ⟨card, hc, eq, hp⟩ := ih (tail.filter _) mem
      exact ⟨card, by rw [representatives]; exact List.mem_cons_of_mem _ hc, eq, hp⟩

private theorem pick_valid (k : Nat) (xs : List Card) :
    pick k xs ⊆ xs ∧ ((pick k xs).map Card.character).Nodup ∧ (pick k xs).length ≤ k := by
  induction k generalizing xs with
  | zero => simp [pick]
  | succ k ih =>
    cases xs with
    | nil => simp [pick]
    | cons a xs =>
      obtain ⟨sub, unique, count⟩ := ih (otherCharacter a xs)
      refine ⟨?_, ?_, ?_⟩
      · intro b hb
        rcases List.mem_cons.mp hb with h | h
        · exact List.mem_cons.mpr (.inl h)
        · exact List.mem_cons.mpr (.inr (mem_other.mp (sub h)).1)
      · simp only [pick, List.map_cons, List.nodup_cons]
        refine ⟨?_, unique⟩
        intro h
        obtain ⟨b, hb, same⟩ := List.mem_map.mp h
        exact (mem_other.mp (sub hb)).2 same
      · simpa [pick] using count

/-- Every chosen representative attains its character's maximum, including
    power ties. -/
theorem best_per_character (k : Nat) (xs : List Card)
    (order : xs.Pairwise (fun a b => ahead a b)) {chosen rival : Card}
    (hc : chosen ∈ pick k xs) (hr : rival ∈ xs)
    (same : rival.character = chosen.character) : rival.power ≤ chosen.power := by
  induction k generalizing xs with
  | zero => simp [pick] at hc
  | succ k ih =>
    cases xs with
    | nil => simp at hr
    | cons a xs =>
      obtain ⟨first, tail⟩ := List.pairwise_cons.mp order
      rcases List.mem_cons.mp hc with rfl | hc
      · rcases List.mem_cons.mp hr with rfl | hr
        · exact Nat.le_refl _
        · exact ahead_power (first _ hr)
      · have different := (mem_other.mp ((pick_valid _ _).1 hc)).2
        apply ih (otherCharacter a xs) (tail.filter _) hc
        apply mem_other.mpr
        rcases List.mem_cons.mp hr with rfl | hr
        · exact False.elim (different same.symm)
        · exact ⟨hr, fun h => different (same.symm.trans h)⟩

private theorem remove_one (a : Card) {ys : List Card} (hne : ys ≠ [])
    (distinct : (ys.map Card.character).Nodup) :
    ∃ b rest, ys.Perm (b :: rest) ∧ ∀ c ∈ rest, c.character ≠ a.character := by
  by_cases h : ∃ b ∈ ys, b.character = a.character
  · obtain ⟨b, hb, same⟩ := h
    have p := List.perm_cons_erase hb
    have unique := (p.map Card.character).nodup distinct
    simp only [List.map_cons, List.nodup_cons] at unique
    refine ⟨b, _, p, ?_⟩
    intro c hc eq
    exact unique.1 (List.mem_map.mpr ⟨c, hc, eq.trans same.symm⟩)
  · cases ys with
    | nil => contradiction
    | cons b rest =>
      refine ⟨b, rest, List.Perm.refl _, ?_⟩
      intro c hc same
      exact h ⟨c, List.mem_cons_of_mem _ hc, same⟩

/-- Exchange one rival card for the best remaining representative. If the
    rival uses that character, remove its card of that character; otherwise any
    rival card can give up the slot. All the other rival cards remain eligible. -/
private theorem pick_optimal (value : Nat → Nat) (mono : ∀ {x y}, x ≤ y → value x ≤ value y)
    (k : Nat) (xs ys : List Card)
    (order : xs.Pairwise (fun a b => ahead a b)) (sub : ys ⊆ xs)
    (distinct : (ys.map Card.character).Nodup) (budget : ys.length ≤ k) :
    totalBy value ys ≤ totalBy value (pick k xs) := by
  induction k generalizing xs ys with
  | zero =>
    have empty : ys = [] := List.length_eq_zero_iff.mp (by omega)
    simp [empty, pick, totalBy]
  | succ k ih =>
    cases xs with
    | nil =>
      have empty : ys = [] := List.subset_nil.mp sub
      simp [empty, totalBy]
    | cons a xs =>
      by_cases empty : ys = []
      · simp [empty, totalBy]
      obtain ⟨b, rest, perm, other⟩ := remove_one a empty distinct
      obtain ⟨first, tail⟩ := List.pairwise_cons.mp order
      have hb := sub (perm.mem_iff.mpr (List.mem_cons_self))
      have hpower : b.power ≤ a.power := by
        rcases List.mem_cons.mp hb with rfl | hin
        · exact Nat.le_refl _
        · exact ahead_power (first _ hin)
      have allowed : rest ⊆ otherCharacter a xs := by
        intro c hc
        have h := sub (perm.mem_iff.mpr (List.mem_cons_of_mem _ hc))
        have diff := other c hc
        refine mem_other.mpr ⟨?_, diff⟩
        rcases List.mem_cons.mp h with rfl | ht
        · exact False.elim (diff rfl)
        · exact ht
      have uq := (perm.map Card.character).nodup distinct
      have len := perm.length_eq
      simp only [List.length_cons] at len
      have bound := ih (otherCharacter a xs) rest (tail.filter _) allowed
        (List.nodup_cons.mp uq).2 (by omega)
      rw [total_perm value perm]
      exact Nat.add_le_add (mono hpower) bound

def missionSupport (main : List Nat) (roster : List Card) : List Card :=
  (representatives ((roster.filter (eligible main)).mergeSort ahead)).take 5

def Legal (main : List Nat) (roster team : List Card) : Prop :=
  team ⊆ roster.filter (eligible main) ∧
  (team.map Card.character).Nodup ∧ team.length ≤ 5

/-- The selected support team is legal and maximizes nonnegative total power
    over all legal teams of up to five distinct characters. -/
theorem mission_support_optimal (main : List Nat) (roster : List Card) :
    Legal main roster (missionSupport main roster) ∧
    ∀ team, Legal main roster team → total team ≤ total (missionSupport main roster) := by
  simp only [missionSupport, take_representatives]
  let xs := roster.filter (eligible main)
  have perm := List.mergeSort_perm xs ahead
  obtain ⟨sub, distinct, size⟩ := pick_valid 5 (xs.mergeSort ahead)
  refine ⟨⟨fun _ h => perm.mem_iff.mp (sub h), distinct, size⟩, ?_⟩
  intro team legal
  exact pick_optimal id (fun h => h) 5 _ team (sorted xs) (fun _ h => perm.mem_iff.mpr (legal.1 h))
    legal.2.1 legal.2.2

/-- The rival may be shorter. Each rival rank must have a partner of at
    least its power at the same rank in the greedy team. -/
inductive RankDominated : List Card → List Card → Prop where
  | nil (ys : List Card) : RankDominated [] ys
  | cons {a b xs ys} (head : a.power ≤ b.power) (tail : RankDominated xs ys) :
      RankDominated (a :: xs) (b :: ys)

private theorem pick_sublist (k : Nat) (xs : List Card) : (pick k xs).Sublist xs := by
  induction k generalizing xs with
  | zero => exact List.nil_sublist _
  | succ k ih =>
    cases xs with
    | nil => exact List.Sublist.refl _
    | cons a rest =>
      exact List.Sublist.cons₂ a ((ih (otherCharacter a rest)).trans List.filter_sublist)

private def mark (threshold power : Nat) : Nat := if threshold ≤ power then 1 else 0

private theorem count_zero {xs : List Card} {t : Nat} (h : ∀ c ∈ xs, c.power < t) :
    totalBy (mark t) xs = 0 := by
  induction xs with
  | nil => rfl
  | cons x xs ih =>
    have head := h x (.head _)
    have tail := ih (fun c hc => h c (.tail _ hc))
    change mark t x.power + totalBy (mark t) xs = 0
    simp [mark, tail, show ¬ t ≤ x.power by omega]

private theorem ranks_of_counts {xs ys : List Card}
    (sx : xs.Pairwise (fun a b => ahead a b)) (sy : ys.Pairwise (fun a b => ahead a b))
    (counts : ∀ t, totalBy (mark t) xs ≤ totalBy (mark t) ys) : RankDominated xs ys := by
  induction xs generalizing ys with
  | nil => exact .nil _
  | cons x xs ih =>
    cases ys with
    | nil =>
      have h := counts x.power
      change mark x.power x.power + totalBy (mark x.power) xs ≤ 0 at h
      simp [mark] at h
    | cons y ys =>
      obtain ⟨hx, sx⟩ := List.pairwise_cons.mp sx
      obtain ⟨hy, sy⟩ := List.pairwise_cons.mp sy
      have head : x.power ≤ y.power := by
        by_cases bad : x.power ≤ y.power
        · exact bad
        have z := count_zero (xs := ys) (t := x.power) (fun c hc => by
          have := ahead_power (hy c hc); omega)
        have h := counts x.power
        change mark x.power x.power + _ ≤ mark x.power y.power + totalBy (mark x.power) ys at h
        simp [mark, bad, z] at h
      refine RankDominated.cons head (ih sx sy ?_)
      intro t
      by_cases small : t ≤ x.power
      · have h := counts t
        change mark t x.power + totalBy (mark t) xs ≤ mark t y.power + totalBy (mark t) ys at h
        simpa [mark, small, Nat.le_trans small head] using h
      · have z := count_zero (xs := xs) (t := t) (fun c hc => by
          have := ahead_power (hx c hc); omega)
        simp [z]

/-- Each threshold indicator is a nondecreasing valuation. Applying the
    exchange proof to these indicators bounds every ranked order statistic,
    including when the rival has fewer than five distinct characters. -/
theorem mission_support_rank_dominates (main : List Nat) (roster team : List Card)
    (legal : Legal main roster team) :
    RankDominated (team.mergeSort ahead) (missionSupport main roster) := by
  let xs := (roster.filter (eligible main)).mergeSort ahead
  have perm := List.mergeSort_perm team ahead
  have eligiblePerm := List.mergeSort_perm (roster.filter (eligible main)) ahead
  rw [missionSupport, take_representatives]
  apply ranks_of_counts (sorted team) ((sorted _).sublist (pick_sublist 5 xs))
  intro t
  apply pick_optimal (mark t) (fun h => by unfold mark; split <;> split <;> omega)
  · exact sorted _
  · intro c hc
    exact eligiblePerm.mem_iff.mpr (legal.1 (perm.mem_iff.mp hc))
  · exact (perm.map Card.character).symm.nodup legal.2.1
  · exact Nat.le_trans (Nat.le_of_eq perm.length_eq) legal.2.2

/-- Ranks can denote ordered finite binary64 powers and accumulators. Only
    monotonicity and nondecrease when adding a nonnegative value are used.
    The fold keeps the actual descending iteration order. -/
theorem mission_support_rounded_optimal (main : List Nat) (roster team : List Card)
    (legal : Legal main roster team) (add : Nat → Nat → Nat)
    (mono : ∀ {a b x y}, a ≤ b → x ≤ y → add a x ≤ add b y)
    (nondecrease : ∀ a x, a ≤ add a x) :
    (team.mergeSort ahead).foldl (fun a c => add a c.power) 0 ≤
    (missionSupport main roster).foldl (fun a c => add a c.power) 0 := by
  have extra (ys : List Card) (start : Nat) :
      start ≤ ys.foldl (fun a c => add a c.power) start := by
    induction ys generalizing start with
    | nil => exact Nat.le_refl _
    | cons y ys ih => exact Nat.le_trans (nondecrease _ _) (ih _)
  have folds {xs ys : List Card} (ranked : RankDominated xs ys) (a b : Nat) (h : a ≤ b) :
      xs.foldl (fun u c => add u c.power) a ≤ ys.foldl (fun u c => add u c.power) b := by
    induction ranked generalizing a b with
    | nil ys => exact Nat.le_trans h (extra ys b)
    | cons head _ ih => exact ih _ _ (mono h head)
  exact folds (mission_support_rank_dominates main roster team legal) 0 0 (Nat.le_refl _)

end Bandori.Single.Support
