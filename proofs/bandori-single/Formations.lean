import Std

namespace Bandori.Single.Formations

abbrev Order := List Nat

/-- Each path removes the actor currently at the step index and reinserts it at
one of positions 0 through 3. Each successive list is the input to the next step. -/
def move (order : Order) (step destination : Nat) : Order :=
  let actor := order[step]?.getD 0
  let rest := order.take step ++ order.drop (step + 1)
  rest.take destination ++ [actor] ++ rest.drop destination

/-- Rust reads the two low bits for step zero and the next two bits for each
later step. Path identifiers 0 through 1023 cover all five independent draws. -/
def runPath (path : Nat) : Nat → Order
  | 0 => [0, 1, 2, 3, 4]
  | step + 1 => move (runPath path step) step ((path >>> (2 * step)) &&& 3)

def paths (n : Nat) : List Order := (List.range (4 ^ n)).map (fun p => runPath p n)

def total (value : α → Int) : List α → Int
  | [] => 0
  | a :: rest => value a + total value rest

abbrev Histogram := List (Order × Nat)

def bump (order : Order) : Histogram → Histogram
  | [] => [(order, 1)]
  | (other, n) :: rest =>
    if order = other then (other, n + 1) :: rest else (other, n) :: bump order rest

def counts : List Order → Histogram
  | [] => []
  | o :: os => bump o (counts os)

def weighted (value : Order → Int) (h : Histogram) : Int :=
  total (fun ow => (ow.2 : Int) * value ow.1) h

theorem weighted_bump (value : Order → Int) (order : Order) (h : Histogram) :
    weighted value (bump order h) = value order + weighted value h := by
  induction h with
  | nil => simp [bump, weighted, total]
  | cons p rest ih =>
    obtain ⟨other, n⟩ := p
    by_cases he : order = other
    · subst other
      simp [bump, weighted, total, Int.add_mul, Int.add_assoc, Int.add_comm, Int.add_left_comm]
    · simp only [bump, if_neg he, weighted, total] at *
      omega

/-- Grouping duplicate paths is exact even when the value of an order depends
on the entire sequence (for example, after skill queue delays). -/
theorem weighted_counts (value : Order → Int) (os : List Order) :
    weighted value (counts os) = total value os := by
  induction os with
  | nil => rfl
  | cons o os ih => simp [counts, weighted_bump, ih, total]

def distribution := counts (paths 5)

theorem random_path_count : (paths 5).length = 1024 := by simp [paths]

set_option maxRecDepth 100000 in
set_option maxHeartbeats 0 in
theorem distinct_weighted_orders :
    distribution.length = 96 ∧ (distribution.map Prod.fst).Nodup := by decide

theorem total_one (xs : List α) : total (fun _ => 1) xs = (xs.length : Int) := by
  induction xs with
  | nil => rfl
  | cons a xs ih => simp [total, ih]; omega

theorem total_weight : weighted (fun _ => 1) distribution = 1024 := by
  rw [distribution, weighted_counts, total_one, random_path_count]
  rfl

def weightAt (window position : Nat) : Int :=
  weighted (fun o => if o[window]? = some position then 1 else 0) distribution

def marginalMatrix : List (List Int) :=
  (List.range 5).map fun w => (List.range 5).map (weightAt w)

set_option maxRecDepth 100000 in
set_option maxHeartbeats 0 in
theorem fixed_window_weights : marginalMatrix =
    [[192, 291, 144, 141, 256], [192, 243, 176, 157, 256],
     [192, 198, 200, 178, 256], [192, 156, 216, 204, 256],
     [256, 136, 288, 344, 0]] := by decide

theorem weighted_add (f g : Order → Int) (h : Histogram) :
    weighted (fun o => f o + g o) h = weighted f h + weighted g h := by
  induction h with
  | nil => rfl
  | cons p rest ih =>
    simp only [weighted, total, Int.mul_add] at *
    omega

/-- Fixed-window contributions can be summed in either order. Queue-dependent
contributions may use full orders in `weighted_counts` instead. -/
theorem weighted_sum (h : Histogram) (windows : List α) (contribution : α → Order → Int) :
    weighted (fun o => total (fun w => contribution w o) windows) h =
      total (fun w => weighted (contribution w) h) windows := by
  induction windows with
  | nil =>
    induction h with
    | nil => rfl
    | cons p rest ih => simpa [weighted, total] using ih
  | cons w ws ih => simp only [total, weighted_add, ih]

theorem weighted_mul (h : Histogram) (f : Order → Int) (c : Int) :
    weighted (fun o => f o * c) h = weighted f h * c := by
  induction h with
  | nil => simp [weighted, total]
  | cons p rest ih =>
    simp only [weighted, total, Int.add_mul, Int.mul_assoc] at *
    rw [ih]

theorem weighted_indicator (w p : Nat) (c : Int) :
    weighted (fun o => if o[w]? = some p then c else 0) distribution =
      weightAt w p * c := by
  rw [weightAt, ← weighted_mul]
  congr 1
  funext o
  split <;> simp_all

/-- In a fixed window the table entry for the actor occupying position p is
scored precisely when p is drawn. This identity holds for arbitrary signed
integer entries, including the zero contribution of an inactive skill. -/
theorem fixed_window_numerator (entry : Nat → Nat → Int) :
    weighted (fun o => total (fun w => total
      (fun p => if o[w]? = some p then entry w p else 0) (List.range 5)) (List.range 5))
      distribution =
    total (fun w => total (fun p => weightAt w p * entry w p) (List.range 5)) (List.range 5) := by
  rw [weighted_sum]
  apply congrArg (fun f : Nat → Int => total f (List.range 5))
  funext w
  rw [weighted_sum]
  apply congrArg (fun f : Nat → Int => total f (List.range 5))
  funext p
  exact weighted_indicator w p (entry w p)

/-- Enumerate all length-n words over the five actor identities. -/
def words : Nat → List Order
  | 0 => [[]]
  | n + 1 => (List.range 5).flatMap fun a => (words n).map (List.cons a)

theorem mem_words (n : Nat) (xs : Order) :
    xs ∈ words n ↔ xs.length = n ∧ ∀ a ∈ xs, a < 5 := by
  induction n generalizing xs with
  | zero =>
    cases xs <;> simp [words]
  | succ n ih =>
    simp only [words, List.mem_flatMap, List.mem_map, List.mem_range]
    constructor
    · rintro ⟨x, hx, ys, hys, rfl⟩
      obtain ⟨hlen, hall⟩ := (ih ys).mp hys
      refine ⟨by simp [hlen], ?_⟩
      intro y hy
      rcases List.mem_cons.mp hy with rfl | hy
      · exact hx
      · exact hall y hy
    · rintro ⟨hlen, hall⟩
      cases xs with
      | nil => simp at hlen
      | cons y ys =>
        refine ⟨y, hall _ (by simp), ys, (ih ys).mpr ⟨by simpa using hlen, ?_⟩, rfl⟩
        intro a ha
        exact hall a (List.mem_cons_of_mem _ ha)

def formations : List Order := (words 5).filter fun xs => xs.Nodup

def Legal (xs : Order) : Prop :=
  xs.length = 5 ∧ (∀ a ∈ xs, a < 5) ∧ xs.Nodup

theorem mem_formations (xs : Order) : xs ∈ formations ↔ Legal xs := by
  simp [formations, mem_words, Legal, and_assoc]

def soloFormations (eligible : Nat → Bool) : List Order :=
  formations.filter fun xs => eligible (xs[2]?.getD 0)

theorem mem_solo (eligible : Nat → Bool) (xs : Order) :
    xs ∈ soloFormations eligible ↔ Legal xs ∧ eligible (xs[2]?.getD 0) = true := by
  simp [soloFormations, mem_formations]

def roomFormations (eligible : Nat → Bool) : List (Nat × Order) :=
  ((List.range 5).filter eligible).flatMap fun leader => formations.map (Prod.mk leader)

theorem mem_room (eligible : Nat → Bool) (leader : Nat) (xs : Order) :
    (leader, xs) ∈ roomFormations eligible ↔ leader < 5 ∧ eligible leader = true ∧ Legal xs := by
  simp [roomFormations, List.mem_flatMap, List.mem_map, mem_formations, and_assoc]
  constructor
  · rintro ⟨_, hl, he, hf, rfl⟩
    exact ⟨hl, he, hf⟩
  · rintro ⟨hl, he, hf⟩
    exact ⟨leader, hl, he, hf, rfl⟩

/-- Higher objective wins. A supplied stable rank (smaller is better) resolves
equal objectives. Equal keys are interchangeable for this theorem. -/
def AtLeast (objective : α → Int) (rank : α → Nat) (a b : α) : Prop :=
  objective a > objective b ∨ (objective a = objective b ∧ rank a ≤ rank b)

instance (v : α → Int) (r : α → Nat) (a b : α) : Decidable (AtLeast v r a b) :=
  inferInstanceAs (Decidable (v a > v b ∨ (v a = v b ∧ r a ≤ r b)))

/-- Two prefixes with the same used-card set have the same possible suffixes.
For a fixed suffix of an additive assignment, scores receive the same increment.
Appending the same digits to equal-length base-five rank keys preserves their
order (`scale` is five to the suffix length). This is the dominance step used
when retaining one entry per mask. -/
theorem common_suffix_dominance (sa sb extra : Int) (ra rb scale tail : Nat)
    (h : sa > sb ∨ sa = sb ∧ ra ≤ rb) :
    sa + extra > sb + extra ∨
      sa + extra = sb + extra ∧ ra * scale + tail ≤ rb * scale + tail := by
  rcases h with hs | ⟨hs, hr⟩
  · left; omega
  · exact Or.inr ⟨by omega, Nat.add_le_add_right (Nat.mul_le_mul_right scale hr) tail⟩

def best (v : α → Int) (r : α → Nat) : List α → Option α
  | [] => none
  | a :: xs => match best v r xs with
    | none => some a
    | some b => if AtLeast v r a b then some a else some b

theorem best_none (v : α → Int) (r : α → Nat) (xs : List α) :
    best v r xs = none ↔ xs = [] := by
  cases xs with
  | nil => simp [best]
  | cons a xs =>
    cases h : best v r xs with
    | none => simp [best, h]
    | some b => by_cases hb : AtLeast v r a b <;> simp [best, h, hb]

theorem best_spec (v : α → Int) (r : α → Nat) (xs : List α) (a : α)
    (h : best v r xs = some a) : a ∈ xs ∧ ∀ b ∈ xs, AtLeast v r a b := by
  induction xs generalizing a with
  | nil => simp [best] at h
  | cons x xs ih =>
    cases ht : best v r xs with
    | none =>
      have he := (best_none v r xs).mp ht
      subst xs
      simp [best] at h
      subst a
      simp [AtLeast]
    | some y =>
      obtain ⟨hy, hopt⟩ := ih y ht
      by_cases hxy : AtLeast v r x y
      · simp [best, ht, hxy] at h
        subst a
        refine ⟨by simp, ?_⟩
        intro b hb
        rcases List.mem_cons.mp hb with rfl | hb
        · simp [AtLeast]
        · have hyb := hopt b hb
          unfold AtLeast at *
          omega
      · simp [best, ht, hxy] at h
        subst a
        refine ⟨by simp [hy], ?_⟩
        intro b hb
        rcases List.mem_cons.mp hb with rfl | hb
        · unfold AtLeast at *
          omega
        · exact hopt b hb

theorem best_solo (eligible : Nat → Bool) (v : Order → Int) (r : Order → Nat)
    (a : Order) (h : best v r (soloFormations eligible) = some a) :
    Legal a ∧ eligible (a[2]?.getD 0) = true ∧
      ∀ b, Legal b → eligible (b[2]?.getD 0) = true → AtLeast v r a b := by
  obtain ⟨ha, hopt⟩ := best_spec _ _ _ _ h
  obtain ⟨hla, hea⟩ := (mem_solo eligible a).mp ha
  exact ⟨hla, hea, fun b hl he => hopt b ((mem_solo eligible b).mpr ⟨hl, he⟩)⟩

theorem best_room (eligible : Nat → Bool) (v : Nat × Order → Int) (r : Nat × Order → Nat)
    (l : Nat) (a : Order) (h : best v r (roomFormations eligible) = some (l, a)) :
    l < 5 ∧ eligible l = true ∧ Legal a ∧
      ∀ k b, k < 5 → eligible k = true → Legal b → AtLeast v r (l, a) (k, b) := by
  obtain ⟨ha, hopt⟩ := best_spec _ _ _ _ h
  obtain ⟨hl, he, hf⟩ := (mem_room eligible l a).mp ha
  exact ⟨hl, he, hf, fun k b hk hek hb =>
    hopt (k, b) ((mem_room eligible k b).mpr ⟨hk, hek, hb⟩)⟩

/-! The fixed-window assignment recurrence. Remaining cards occupy their
original relative order in the pool, so the recurrence can be tabulated by the
remaining subset. The full enumeration and recurrence share legal transitions. -/

structure Assignment where
  order : Order
  value : Int
  key : Nat
  deriving DecidableEq

private abbrev Dominates := AtLeast Assignment.value Assignment.key

/-- Keys read card identities as base-five digits, most significant first. -/
def wordKey : Order → Nat
  | [] => 0
  | a :: xs => a * 5 ^ xs.length + wordKey xs

theorem wordKey_range (xs : Order) (h : ∀ a ∈ xs, a < 5) :
    wordKey xs < 5 ^ xs.length := by
  induction xs with
  | nil => decide
  | cons a xs ih =>
    have ha : a ≤ 4 := by have := h a (by simp); omega
    have ht := ih (fun x hx => h x (List.mem_cons_of_mem _ hx))
    have hm := Nat.mul_le_mul_right (5 ^ xs.length) ha
    simp only [wordKey, List.length_cons, Nat.pow_succ]
    omega

/-- For equal-length legal suffixes even the largest tail of the smaller
leading digit is below the smallest tail of the larger digit. Equal leading
digits add exactly the same amount, giving ordinary lexicographic ordering. -/
theorem wordKey_first_difference (a b : Nat) (u v : Order) (hlen : u.length = v.length)
    (hu : ∀ i ∈ u, i < 5) (hab : a < b) : wordKey (a :: u) < wordKey (b :: v) := by
  have hp := wordKey_range u hu
  have hm := Nat.mul_le_mul_right (5 ^ u.length) hab
  simp only [wordKey, ← hlen, Nat.succ_mul] at *
  omega

def choices (eligible : Nat → Bool) (position : Nat) (pool : Order) : Order :=
  pool.filter fun c => position != 2 || eligible c

def attach (matrix : Nat → Nat → Int) (position card remaining : Nat)
    (tail : Assignment) : Assignment :=
  ⟨card :: tail.order, matrix position card + tail.value,
    card * 5 ^ remaining + tail.key⟩

private theorem attach_mono (m : Nat → Nat → Int) (p c n : Nat) (a b : Assignment)
    (h : Dominates a b) : Dominates (attach m p c n a) (attach m p c n b) := by
  simp only [Dominates, AtLeast, attach] at *
  omega

def allAssignments (m : Nat → Nat → Int) (eligible : Nat → Bool) :
    Nat → Nat → Order → List Assignment
  | 0, _, _ => [⟨[], 0, 0⟩]
  | n + 1, p, pool => (choices eligible p pool).flatMap fun c =>
    (allAssignments m eligible n (p+1) (pool.erase c)).map (attach m p c n)

def suffixAssignment (m : Nat → Nat → Int) (eligible : Nat → Bool) :
    Nat → Nat → Order → List Assignment
  | 0, _, _ => [⟨[], 0, 0⟩]
  | n + 1, p, pool =>
    let candidates := (choices eligible p pool).flatMap fun c =>
      (suffixAssignment m eligible n (p+1) (pool.erase c)).map (attach m p c n)
    (best Assignment.value Assignment.key candidates).toList

private def Covers (short full : List Assignment) : Prop :=
  (∀ a ∈ short, a ∈ full) ∧ (∀ b ∈ full, ∃ a ∈ short, Dominates a b)

private theorem best_covers (xs : List Assignment) :
    Covers (best Assignment.value Assignment.key xs).toList xs := by
  cases he : best Assignment.value Assignment.key xs with
  | none =>
    have hx := (best_none _ _ xs).mp he
    subst xs
    simp [Covers]
  | some a =>
    obtain ⟨ha, hbest⟩ := best_spec _ _ _ _ he
    simpa [Covers, Dominates] using And.intro ha hbest

private theorem covers_trans {xs ys zs : List Assignment}
    (h : Covers xs ys) (g : Covers ys zs) : Covers xs zs := by
  refine ⟨fun x hx => g.1 _ (h.1 _ hx), ?_⟩
  intro z hz
  obtain ⟨y, hy, hyz⟩ := g.2 z hz
  obtain ⟨x, hx, hxy⟩ := h.2 y hy
  refine ⟨x, hx, ?_⟩
  simp only [Dominates, AtLeast] at *
  omega

private theorem covers_branches (cs : List Nat) (short full : Nat → List Assignment)
    (f : Nat → Assignment → Assignment) (h : ∀ c, Covers (short c) (full c))
    (hm : ∀ c a b, Dominates a b → Dominates (f c a) (f c b)) :
    Covers (cs.flatMap fun c => (short c).map (f c)) (cs.flatMap fun c => (full c).map (f c)) := by
  constructor
  · intro x hx
    obtain ⟨c, hc, hx⟩ := List.mem_flatMap.mp hx
    obtain ⟨a, ha, rfl⟩ := List.mem_map.mp hx
    exact List.mem_flatMap.mpr ⟨c, hc, List.mem_map.mpr ⟨a, (h c).1 _ ha, rfl⟩⟩
  · intro x hx
    obtain ⟨c, hc, hx⟩ := List.mem_flatMap.mp hx
    obtain ⟨a, ha, rfl⟩ := List.mem_map.mp hx
    obtain ⟨b, hb, hba⟩ := (h c).2 _ ha
    exact ⟨f c b, List.mem_flatMap.mpr ⟨c, hc, List.mem_map.mpr ⟨b, hb, rfl⟩⟩, hm _ _ _ hba⟩

private theorem suffix_covers (m : Nat → Nat → Int) (e : Nat → Bool) (n p : Nat) (pool : Order) :
    Covers (suffixAssignment m e n p pool) (allAssignments m e n p pool) := by
  induction n generalizing p pool with
  | zero => simp [suffixAssignment, allAssignments, Covers, Dominates, AtLeast]
  | succ n ih =>
    unfold suffixAssignment allAssignments
    apply covers_trans (best_covers _)
    apply covers_branches
    · exact fun c => ih (p+1) (pool.erase c)
    · exact fun c => attach_mono m p c n

/-- The recurrence returns only feasible assignments and attains the optimum
of full enumeration with stable positional ties, for every signed matrix. -/
theorem suffix_assignment_optimal (m : Nat → Nat → Int) (e : Nat → Bool)
    (n p : Nat) (pool : Order) :
    (∀ a ∈ suffixAssignment m e n p pool, a ∈ allAssignments m e n p pool) ∧
    (∀ b ∈ allAssignments m e n p pool, ∃ a ∈ suffixAssignment m e n p pool,
      AtLeast Assignment.value Assignment.key a b) :=
  suffix_covers m e n p pool

theorem assignment_key_and_length (m : Nat → Nat → Int) (e : Nat → Bool)
    (n p : Nat) (pool : Order) (a : Assignment) (h : a ∈ allAssignments m e n p pool) :
    a.order.length = n ∧ a.key = wordKey a.order := by
  induction n generalizing p pool a with
  | zero =>
    simp [allAssignments] at h
    subst a
    exact ⟨rfl, rfl⟩
  | succ n ih =>
    obtain ⟨c, _, hc⟩ := List.mem_flatMap.mp h
    obtain ⟨tail, ht, rfl⟩ := List.mem_map.mp hc
    obtain ⟨hlen, hk⟩ := ih (p+1) (pool.erase c) tail ht
    simp [attach, wordKey, hlen, hk]

def scoreOrder (m : Nat → Nat → Int) (position : Nat) : Order → Assignment
  | [] => ⟨[], 0, 0⟩
  | c :: xs => attach m position c xs.length (scoreOrder m (position + 1) xs)

def marginalEntry (window : Nat → Nat → Int) (encore : Nat → Int) (p c : Nat) : Int :=
  total (fun w => weightAt w p * window w c) (List.range 5) +
    1024 * (if p = 2 then encore c else 0)

def fixedOrderScore (window : Nat → Nat → Int) (encore : Nat → Int) (draw : Order) :
    Nat → Order → Int
  | _, [] => 0
  | p, c :: xs =>
    (total (fun w => if draw[w]? = some p then window w c else 0) (List.range 5) +
      (if p = 2 then encore c else 0)) + fixedOrderScore window encore draw (p+1) xs

private theorem weighted_constant (c : Int) : weighted (fun _ => c) distribution = 1024 * c := by
  have h := weighted_mul distribution (fun _ => 1) c
  simpa [total_weight] using h

/-- The fixed-window assignment objective is exactly the numerator obtained
by replaying all 1024 random paths, including the central leader's encore.
A song's common base score adds the same constant to every formation. -/
theorem fixed_assignment_equals_paths (window : Nat → Nat → Int) (encore : Nat → Int)
    (p : Nat) (xs : Order) :
    (scoreOrder (marginalEntry window encore) p xs).value =
      total (fun o => fixedOrderScore window encore o p xs) (paths 5) := by
  rw [← weighted_counts]
  change _ = weighted _ distribution
  induction xs generalizing p with
  | nil => simp [scoreOrder, fixedOrderScore, weighted_constant]
  | cons c xs ih =>
    simp only [scoreOrder, attach, fixedOrderScore, weighted_add, weighted_constant, weighted_sum,
      weighted_indicator, marginalEntry]
    rw [ih]

/-- With the leader fixed, an encore delayed only by the fifth actor contributes
the entry indexed by that actor. Rust adds the fifth-row marginal weight of
each position times this contribution to the corresponding assignment entry. -/
def delayedEncoreEntry (window : Nat → Nat → Int) (last : Nat → Int) (p c : Nat) : Int :=
  total (fun w => weightAt w p * window w c) (List.range 5) + weightAt 4 p * last c

def delayedEncoreOrderScore (window : Nat → Nat → Int) (last : Nat → Int) (draw : Order) :
    Nat → Order → Int
  | _, [] => 0
  | p, c :: xs =>
    (total (fun w => if draw[w]? = some p then window w c else 0) (List.range 5) +
      (if draw[4]? = some p then last c else 0)) + delayedEncoreOrderScore window last draw (p+1) xs

private def addLast (window : Nat → Nat → Int) (last : Nat → Int) (w c : Nat) : Int :=
  window w c + (if w = 4 then last c else 0)

private theorem delayed_entry_eq (window : Nat → Nat → Int) (last : Nat → Int) :
    delayedEncoreEntry window last = marginalEntry (addLast window last) (fun _ => 0) := by
  funext p c
  have hr : List.range 5 = [0,1,2,3,4] := rfl
  simp [delayedEncoreEntry, marginalEntry, addLast, hr, total, Int.mul_add, Int.add_assoc]

private theorem delayed_order_eq (window : Nat → Nat → Int) (last : Nat → Int)
    (o : Order) (p : Nat) (xs : Order) :
    delayedEncoreOrderScore window last o p xs =
      fixedOrderScore (addLast window last) (fun _ => 0) o p xs := by
  have hr : List.range 5 = [0,1,2,3,4] := rfl
  induction xs generalizing p with
  | nil => rfl
  | cons c xs ih =>
    by_cases h : o[4]? = some p <;>
      simp [delayedEncoreOrderScore, fixedOrderScore, addLast, hr, total, ih, h, Int.add_assoc]

theorem delayed_encore_assignment_equals_paths (window : Nat → Nat → Int) (last : Nat → Int)
    (p : Nat) (xs : Order) :
    (scoreOrder (delayedEncoreEntry window last) p xs).value =
      total (fun o => delayedEncoreOrderScore window last o p xs) (paths 5) := by
  rw [delayed_entry_eq, fixed_assignment_equals_paths]
  simp only [delayed_order_eq]

theorem enumerate_order (m : Nat → Nat → Int) (e : Nat → Bool) (xs pool : Order) (p : Nat)
    (hd : xs.Nodup) (hp : ∀ c ∈ xs, c ∈ pool)
    (he : ∀ i c, xs[i]? = some c → p + i = 2 → e c = true) :
    scoreOrder m p xs ∈ allAssignments m e xs.length p pool := by
  induction xs generalizing pool p with
  | nil => simp [scoreOrder, allAssignments]
  | cons c xs ih =>
    obtain ⟨hnot, hd'⟩ := List.nodup_cons.mp hd
    have hhead : c ∈ choices e p pool := by
      by_cases hpos : p = 2
      · have hc := he 0 c (by simp) (by omega)
        simp [choices, hp c (by simp), hc]
      · simp [choices, hp c (by simp), hpos]
    apply List.mem_flatMap.mpr
    refine ⟨c, hhead, List.mem_map.mpr ⟨scoreOrder m (p+1) xs, ?_, rfl⟩⟩
    apply ih (pool := pool.erase c) (p := p+1) hd'
    · intro a ha
      have hne : a ≠ c := fun h => hnot (h ▸ ha)
      exact (List.mem_erase_of_ne hne).mpr (hp a (List.mem_cons_of_mem _ ha))
    · intro i a hi hpos
      exact he (i+1) a (by simpa using hi) (by omega)

private theorem legal_score_mem (m : Nat → Nat → Int) (e : Nat → Bool) (xs : Order)
    (hl : Legal xs) (he : e (xs[2]?.getD 0) = true) :
    scoreOrder m 0 xs ∈ allAssignments m e 5 0 (List.range 5) := by
  obtain ⟨hlen, hp, hd⟩ := hl
  suffices hs : scoreOrder m 0 xs ∈ allAssignments m e xs.length 0 (List.range 5) by
    simpa only [hlen] using hs
  apply enumerate_order m e xs (List.range 5) 0 hd (fun x hx => List.mem_range.mpr (hp x hx))
  intro i c hget hi
  have htwo : i = 2 := by omega
  subst i
  simpa [hget] using he

/-- Starting from the five different cards, every legal solo formation's
matrix score is dominated by the recurrence's result, including equal scores. -/
theorem solo_assignment_complete (m : Nat → Nat → Int) (e : Nat → Bool) (xs : Order)
    (hl : Legal xs) (he : e (xs[2]?.getD 0) = true) :
    ∃ a ∈ suffixAssignment m e 5 0 (List.range 5),
      AtLeast Assignment.value Assignment.key a (scoreOrder m 0 xs) :=
  (suffix_assignment_optimal m e 5 0 (List.range 5)).2 _ (legal_score_mem m e xs hl he)

private theorem enumeration_feasible (m : Nat → Nat → Int) (e : Nat → Bool)
    (n p : Nat) (pool : Order) (hd : pool.Nodup) (a : Assignment)
    (ha : a ∈ allAssignments m e n p pool) :
    a.order.Nodup ∧ (∀ x ∈ a.order, x ∈ pool) ∧
      (∀ i c, a.order[i]? = some c → p + i = 2 → e c = true) := by
  induction n generalizing p pool a with
  | zero =>
    simp [allAssignments] at ha
    subst a
    simp
  | succ n ih =>
    obtain ⟨card, hc, hx⟩ := List.mem_flatMap.mp ha
    obtain ⟨tail, ht, rfl⟩ := List.mem_map.mp hx
    obtain ⟨hn, hs, he⟩ := ih (p+1) (pool.erase card) (hd.erase card) tail ht
    obtain ⟨hcard, hok⟩ := List.mem_filter.mp hc
    refine ⟨List.nodup_cons.mpr ⟨fun h => hd.not_mem_erase (hs _ h), hn⟩, ?_, ?_⟩
    · intro x h
      rcases List.mem_cons.mp h with rfl | h
      · exact hcard
      · exact List.mem_of_mem_erase (hs _ h)
    · intro i c hget hpos
      cases i with
      | zero =>
        have heq : card = c := by simpa [attach] using hget
        have hp : p = 2 := by omega
        simpa [hp, heq] using hok
      | succ i =>
        exact he i c (by simpa [attach] using hget) (by omega)

private theorem suffix_unique (m : Nat → Nat → Int) (e : Nat → Bool) (n p : Nat)
    (pool : Order) (a b : Assignment)
    (ha : a ∈ suffixAssignment m e n p pool) (hb : b ∈ suffixAssignment m e n p pool) :
    a = b := by
  cases n with
  | zero =>
    exact (List.eq_of_mem_singleton ha).trans (List.eq_of_mem_singleton hb).symm
  | succ n =>
    simp only [suffixAssignment, Option.mem_toList, Option.mem_def] at ha hb
    exact Option.some_inj.mp (ha.symm.trans hb)

private theorem enumerated_solo_legal (m : Nat → Nat → Int) (e : Nat → Bool) (a : Assignment)
    (hall : a ∈ allAssignments m e 5 0 (List.range 5)) :
    Legal a.order ∧ e (a.order[2]?.getD 0) = true := by
  have hlen := (assignment_key_and_length _ _ _ _ _ _ hall).1
  obtain ⟨hd, hpool, hleader⟩ := enumeration_feasible _ _ _ _ _ List.nodup_range _ hall
  have hget := @List.getElem?_eq_getElem Nat a.order 2 (by omega)
  exact ⟨⟨hlen, fun x hx => List.mem_range.mp (hpool x hx), hd⟩, by simpa [hget] using hleader 2 _ hget rfl⟩

/-- For a fixed five-card window matrix, any returned formation is legal,
has an eligible central leader, and dominates every legal formation when
compared first by score, then by its positional key. -/
theorem solo_assignment_winner (m : Nat → Nat → Int) (e : Nat → Bool) (a : Assignment)
    (ha : a ∈ suffixAssignment m e 5 0 (List.range 5)) :
    Legal a.order ∧ e (a.order[2]?.getD 0) = true ∧
      ∀ xs, Legal xs → e (xs[2]?.getD 0) = true →
        AtLeast Assignment.value Assignment.key a (scoreOrder m 0 xs) := by
  have hall := (suffix_assignment_optimal m e 5 0 (List.range 5)).1 a ha
  obtain ⟨hl, he⟩ := enumerated_solo_legal _ _ _ hall
  refine ⟨hl, he, ?_⟩
  intro xs hleg he
  obtain ⟨b, hb, hopt⟩ := solo_assignment_complete m e xs hleg he
  exact suffix_unique m e _ _ _ b a hb ha ▸ hopt

end Bandori.Single.Formations
