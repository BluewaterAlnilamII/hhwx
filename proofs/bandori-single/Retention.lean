import Search

/-! Top-1 preservation for the retained list, including repeated appearances
    of the same five physical cards in different formations or configurations. -/
namespace Bandori.Single.Retention
open Bandori.Single.Search

def rosterKey (a : Candidate) := a.cards.mergeSort (· ≤ ·)

private def cmp (a b : Candidate) := atLeast (key a) (key b)

/-- The flat list keeps its existing representative on comparison ties. A
    strictly better duplicate removes that representative and appends itself. -/
def insertCandidate (a : Candidate) : List Candidate → List Candidate
  | [] => [a]
  | b :: bs =>
    if rosterKey a = rosterKey b then
      if atLeast (key b) (key a) then b :: bs else bs ++ [a]
    else b :: insertCandidate a bs

/-- Each retained entry was seen, and each seen entry has an at-least-as-good
    retained witness. This invariant only claims preservation of first place. -/
private def Represents (kept seen : List Candidate) : Prop :=
  kept ⊆ seen ∧ ∀ s ∈ seen, ∃ b ∈ kept, wins b s

private theorem insert_rep (a : Candidate) (old : List Candidate) :
    Represents (insertCandidate a old) (a :: old) := by
  induction old with
  | nil =>
    exact ⟨fun _ h => h, fun s hs => ⟨s, hs, wins_refl s⟩⟩
  | cons b bs ih =>
    simp only [insertCandidate]
    split
    · split
      next hba =>
        refine ⟨fun _ h => List.mem_cons_of_mem _ h, ?_⟩
        intro s hs
        rcases List.mem_cons.mp hs with rfl | hs
        · exact ⟨b, List.mem_cons_self, hba⟩
        · exact ⟨s, hs, wins_refl _⟩
      next hba =>
        have ab := (atLeast_total (key b) (key a)).resolve_left hba
        refine ⟨?_, ?_⟩
        · intro s hs
          simp only [List.mem_append, List.mem_singleton] at hs
          simp only [List.mem_cons]
          rcases hs with hs | rfl
          · exact Or.inr (Or.inr hs)
          · exact Or.inl rfl
        · intro s hs
          simp only [List.mem_cons] at hs
          rcases hs with rfl | rfl | hs
          · exact ⟨_, by simp, wins_refl _⟩
          · exact ⟨_, by simp, ab⟩
          · exact ⟨_, List.mem_append_left _ hs, wins_refl _⟩
    · refine ⟨?_, ?_⟩
      · intro s hs
        rcases List.mem_cons.mp hs with rfl | hs
        · simp
        · rcases List.mem_cons.mp (ih.1 hs) with rfl | ht <;> simp_all
      · intro s hs
        simp only [List.mem_cons] at hs
        rcases hs with hs | rfl | hs
        · obtain ⟨c, hc, hcs⟩ := ih.2 s (List.mem_cons.mpr (.inl hs))
          exact ⟨c, List.mem_cons_of_mem _ hc, hcs⟩
        · exact ⟨_, List.mem_cons_self, wins_refl _⟩
        · obtain ⟨c, hc, hcs⟩ := ih.2 s (List.mem_cons_of_mem _ hs)
          exact ⟨c, List.mem_cons_of_mem _ hc, hcs⟩

def update (limit : Nat) (old : List Candidate) (a : Candidate) : List Candidate :=
  ((insertCandidate a old).mergeSort cmp).take limit

/-- The implementation may return immediately for a rejected duplicate. Its
    already sorted, bounded retained list is unchanged by sorting and taking. -/
theorem rejected_unchanged {a : Candidate} {old : List Candidate} {limit : Nat}
    (rejected : insertCandidate a old = old) (ordered : old.Pairwise wins)
    (bounded : old.length ≤ limit) : update limit old a = old := by
  rw [update, rejected, List.mergeSort_of_sorted (le := cmp) ordered, List.take_of_length_le bounded]

private theorem sorted (rows : List Candidate) : (rows.mergeSort cmp).Pairwise wins := by
  apply List.sorted_mergeSort (le := cmp)
  · intro a b c
    exact @wins_trans a b c
  · intro a b
    exact Bool.or_eq_true_iff.mpr (atLeast_total (key a) (key b))

private theorem first_optimal {xs : List Candidate} (hs : xs.Pairwise wins) :
    Optimal (fun a => a ∈ xs) xs.head? := by
  cases xs with
  | nil => simp [Optimal]
  | cons x xs =>
    constructor
    · intro a h
      have eq : x = a := Option.some.inj h
      simp [eq]
    · intro a h
      refine ⟨x, rfl, ?_⟩
      rcases List.mem_cons.mp h with rfl | ha
      · exact wins_refl _
      · exact (List.pairwise_cons.mp hs).1 _ ha

private theorem update_rep {limit : Nat} (positive : 0 < limit) (a : Candidate)
    {old seen : List Candidate} (previous : Represents old seen) :
    Represents (update limit old a) (a :: seen) := by
  obtain ⟨actual, covers⟩ := insert_rep a old
  have perm := List.mergeSort_perm (insertCandidate a old) cmp
  have best := first_optimal (sorted (insertCandidate a old))
  constructor
  · intro b hb
    have was := actual (perm.mem_iff.mp ((List.take_sublist _ _).subset hb))
    rcases List.mem_cons.mp was with rfl | was
    · exact List.mem_cons_self
    · exact List.mem_cons_of_mem _ (previous.1 was)
  · intro s hs
    obtain ⟨c, hc, hcs⟩ : ∃ c ∈ a :: old, wins c s := by
      rcases List.mem_cons.mp hs with rfl | was
      · exact ⟨_, List.mem_cons_self, wins_refl _⟩
      · obtain ⟨c, hc, hcs⟩ := previous.2 _ was
        exact ⟨_, List.mem_cons_of_mem _ hc, hcs⟩
    obtain ⟨d, hd, hdc⟩ := covers c hc
    obtain ⟨b, head, hbd⟩ := best.2 _ (perm.mem_iff.mpr hd)
    obtain ⟨tail, heq⟩ := List.head?_eq_some_iff.mp head
    refine ⟨b, ?_, wins_trans hbd (wins_trans hdc hcs)⟩
    cases limit with
    | zero => contradiction
    | succ k => simp [update, heq]

/-- The end of the input list is the beginning of the discovery history. Each
    step sorts and truncates before the next candidate arrives. -/
def kept (limit : Nat) : List Candidate → List Candidate
  | [] => []
  | a :: seen => update limit (kept limit seen) a

theorem top_one {limit : Nat} (positive : 0 < limit) (seen : List Candidate) :
    Optimal (fun a => a ∈ seen) (kept limit seen).head? := by
  have rep : Represents (kept limit seen) seen := by
    induction seen with
    | nil => simp [kept, Represents]
    | cons a seen ih => exact update_rep positive a ih
  have ordered : (kept limit seen).Pairwise wins := by
    cases seen with
    | nil => simp [kept]
    | cons a seen => exact (sorted _).sublist (List.take_sublist _ _)
  have best := first_optimal ordered
  constructor
  · intro a ha
    exact rep.1 (best.1 _ ha)
  · intro a ha
    obtain ⟨c, hc, hca⟩ := rep.2 _ ha
    obtain ⟨b, hb, hbc⟩ := best.2 _ hc
    exact ⟨_, hb, wins_trans hbc hca⟩

theorem no_result_iff {limit : Nat} (positive : 0 < limit) (seen : List Candidate) :
    (kept limit seen).head? = none ↔ seen = [] := by
  constructor
  · intro empty
    cases seen with
    | nil => rfl
    | cons a rest =>
      obtain ⟨_, hb, _⟩ := (top_one positive (a :: rest)).2 a List.mem_cons_self
      rw [empty] at hb
      contradiction
  · rintro rfl
    rfl

/-- Lift the retained maximum when discovery covers the feasible space up to
    domination. An initial incumbent supplied from elsewhere must be included
    in the discovery history before using this lemma. -/
theorem lift_top_one {limit : Nat} (positive : 0 < limit) (seen : List Candidate)
    (legal : Candidate → Prop) (feasible : ∀ s ∈ seen, legal s)
    (covers : ∀ a, legal a → ∃ s ∈ seen, wins s a) :
    Optimal legal (kept limit seen).head? := by
  obtain ⟨attained, maximum⟩ := top_one positive seen
  refine ⟨fun b h => feasible b (attained b h), ?_⟩
  intro a ha
  obtain ⟨s, hs, hsa⟩ := covers a ha
  obtain ⟨b, hb, hbs⟩ := maximum s hs
  exact ⟨b, hb, wins_trans hbs hsa⟩

/-- Instrument the depth-first traversal with its visited leaves, newest
    first. Each child runs once. A pruned subtree contributes no candidates. -/
def trace : Tree → Option Candidate → Option Candidate × List Candidate
  | .empty, inc => (inc, [])
  | .leaf a, inc => (retain inc a, [a])
  | .branch hint left right, inc =>
    if cut hint inc then (inc, [])
    else
      let l := trace left inc
      let r := trace right l.1
      (r.1, r.2 ++ l.2)

/-- Erasing the trace returns the original search result. Every visited leaf
    is in the tree, and the final incumbent was either supplied or visited. -/
theorem trace_search (t : Tree) (inc : Option Candidate) :
    (trace t inc).1 = search t inc ∧
    (∀ a ∈ (trace t inc).2, Contains t a) ∧
    ∀ a, (trace t inc).1 = some a → inc = some a ∨ a ∈ (trace t inc).2 := by
  induction t generalizing inc with
  | empty => simp [trace, search]
  | leaf x =>
    refine ⟨rfl, ?_, ?_⟩
    · simp [trace, Contains]
    · intro a ha
      change retain inc x = some a at ha
      cases inc with
      | none => exact Or.inr (by simpa [trace] using (Option.some.inj ha).symm)
      | some b =>
        simp only [retain] at ha
        split at ha
        · exact Or.inl ha
        · exact Or.inr (by simpa [trace] using (Option.some.inj ha).symm)
  | branch hint l r ihl ihr =>
    simp only [trace, search]
    split
    · simp
    · obtain ⟨lb, lm, lo⟩ := ihl inc
      obtain ⟨rb, rm, ro⟩ := ihr (trace l inc).1
      refine ⟨rb.trans (congrArg (search r) lb), ?_, ?_⟩
      · intro a ha
        rcases List.mem_append.mp ha with h | h
        · exact Or.inr (rm a h)
        · exact Or.inl (lm a h)
      · intro a ha
        rcases ro a ha with fromLeft | fromRight
        · rcases lo a fromLeft with initial | visited
          · exact Or.inl initial
          · exact Or.inr (List.mem_append_right _ visited)
        · exact Or.inr (List.mem_append_left _ fromRight)

/-- The visited set covers the full legal tree when all pruning hints are
    sound. Retaining only the bounded, deduplicated list preserves that optimum. -/
theorem retained_search_optimal {limit : Nat} (positive : 0 < limit) (t : Tree)
    (valid : Valid t) : Optimal (Contains t) (kept limit (trace t none).2).head? := by
  obtain ⟨same, feasible, origin⟩ := trace_search t none
  apply lift_top_one positive _ _ feasible
  intro a ha
  obtain ⟨b, hb, hba⟩ := (search_optimal t none valid).2 a (Or.inr ha)
  have visited := (origin b (same.trans hb)).resolve_left (by simp)
  exact ⟨b, visited, hba⟩

end Bandori.Single.Retention
