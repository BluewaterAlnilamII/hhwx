import Search
import Retention
import Formations
import Scoring
import SkillBounds
import Bounds
import RoundedPoints
import Support

/-! Single-song Top-1 for normalized character groups, enabled equipment
    configurations and per-order scores. Numerical inputs below are ordered
    nonnegative keys in the same representation as the settlement operations.
    The supplied room value is for the same formation as the player's score. -/
namespace Bandori.Single

abbrev Order := Formations.Order

inductive Target where
  | score
  | event (rule : RoundedPoints.Rule Nat) -- base and divisor are ordered numeric keys

structure Values where
  own : Nat
  room : Nat
  bonus : Nat
  support : Nat

def objective (ops : RoundedPoints.Ops Nat) : Target → Values → Nat
  | .score, v => v.own
  | .event rule, v => RoundedPoints.points ops rule v.own v.room v.bonus v.support

structure Plan where
  leader : Nat
  seats : Order

def plans (multi : Bool) (eligible : Nat → Bool) : List Plan :=
  if multi then (Formations.roomFormations eligible).map (fun (l, xs) => ⟨l, xs⟩)
  else (Formations.soloFormations eligible).map (fun xs => ⟨xs[2]?.getD 0, xs⟩)

def Allowed (multi : Bool) (eligible : Nat → Bool) (p : Plan) : Prop :=
  Formations.Legal p.seats ∧ eligible p.leader = true ∧
    (if multi then p.leader < 5 else p.leader = p.seats[2]?.getD 0)

theorem plans_complete (multi eligible p) : p ∈ plans multi eligible ↔ Allowed multi eligible p := by
  obtain ⟨l, xs⟩ := p
  cases multi <;> simp [plans, Allowed, List.mem_map, Formations.mem_solo, Formations.mem_room]
  · constructor
    · rintro ⟨⟨hl, he⟩, rfl⟩; exact ⟨hl, he, rfl⟩
    · rintro ⟨hl, he, rfl⟩; exact ⟨⟨hl, he⟩, rfl⟩
  · constructor
    · rintro ⟨h, he, hl⟩; exact ⟨hl, he, h⟩
    · rintro ⟨hl, he, h⟩; exact ⟨h, he, hl⟩

/-- Numeric boundaries supplied by normalization and the note scorer. A
    weighted numerator is converted once to the score key; at this boundary
    the running program divides the converted integer by 1024 in binary64. -/
structure TeamData where
  eligible : Nat → Bool
  song : Scoring.Song Nat  -- actor skills reference resolved effects by index
  meanKey : Int → Nat
  power : Nat → Nat
  room : Plan → Nat → Nat
  bonus : Nat
  support : Nat

def mean (data : TeamData) (p : Plan) : Nat :=
  data.meanKey (Formations.weighted (fun positions =>
    Scoring.perOrderScore data.song p.leader (positions.map (fun i => p.seats[i]?.getD 0)))
      Formations.distribution)

/-- This identity holds even when earlier actors change every later window. -/
theorem mean_of_paths (d : TeamData) (p : Plan) :
    mean d p = d.meanKey (Formations.total (fun positions =>
      Scoring.noteScore d.song p.leader
        (Scoring.windows d.song p.leader (positions.map (fun i => p.seats[i]?.getD 0)))
        [] d.song.notes) (Formations.paths 5)) := by
  exact congrArg d.meanKey (Scoring.weighted_score_eq_path_notes _ _ _)

/-- Sufficient range for exact conversion of the integer numerator to binary64.
    Division by the power of two 1024 then preserves its ordering. No claim
    about which normalized requests meet this bound is built into the lemma. -/
theorem numerator_range (f : Order → Int)
    (perOrder : ∀ o ∈ Formations.paths 5, 0 ≤ f o ∧ f o ≤ 2^43) :
    let n := Formations.weighted f Formations.distribution
    0 ≤ n ∧ n ≤ 2^53 := by
  have bound (xs : List Order) (h : ∀ o ∈ xs, 0 ≤ f o ∧ f o ≤ 2^43) :
      0 ≤ Formations.total f xs ∧ Formations.total f xs ≤ (xs.length : Int) * 2^43 := by
    induction xs with
    | nil => simp [Formations.total]
    | cons o os ih =>
      have hh := h o (by simp)
      have ht := ih (fun a ha => h a (List.mem_cons_of_mem _ ha))
      simp only [Formations.total, List.length_cons, Int.natCast_succ]
      omega
  simpa only [Formations.distribution, Formations.weighted_counts, Formations.random_path_count]
    using bound (Formations.paths 5) perOrder

private theorem total_scaled_le (notes : List α) (value : α → Int) (scale cap : Int)
    (h : ∀ n ∈ notes, value n * scale ≤ cap) :
    Formations.total value notes * scale ≤ (notes.length : Int) * cap := by
  induction notes with
  | nil => simp [Formations.total]
  | cons n ns ih =>
    have hh := h n (by simp)
    have ht := ih (fun a ha => h a (List.mem_cons_of_mem _ ha))
    simp only [Formations.total, Int.add_mul, List.length_cons, Int.natCast_succ, Int.one_mul]
    omega

/-- In exact units, `product / units` represents power times the level and skill
multipliers. A note has at most seven contributions (base and six windows),
with combo ≤ 111/100, judgment ≤ 11/10 and Fever ≤ 2. Its chart-length
divisor cancels on summation. Under the factor-32 admission budget these
local bounds imply the 53-bit limit for the weighted numerator.

The two inequalities on the input budget and note values are in exact units.
Relating native binary64 evaluation of each to these inequalities is separate. -/
theorem admitted_numerator_range (notes : List α) (note : Order → α → Int)
    (product units : Int) (hnotes : notes ≠ []) (hu : 0 < units) (hp : 0 ≤ product)
    (budget : 32 * product ≤ 2^43 * units)
    (nonneg : ∀ o ∈ Formations.paths 5, 0 ≤ Formations.total (note o) notes)
    (perNote : ∀ o ∈ Formations.paths 5, ∀ n ∈ notes,
      note o n * ((notes.length : Int) * units * 1000) ≤ 7 * 111 * 11 * 2 * product) :
    let num := Formations.weighted (fun o => Formations.total (note o) notes) Formations.distribution
    0 ≤ num ∧ num ≤ 2^53 := by
  apply numerator_range
  intro o ho
  refine ⟨nonneg o ho, ?_⟩
  have hn : 0 < (notes.length : Int) := by
    have := List.length_pos_iff.mpr hnotes
    omega
  have factor : 7 * 111 * 11 * 2 * product ≤ 1000 * (32 * product) := by omega
  apply Int.le_of_mul_le_mul_right (a := (notes.length : Int) * units * 1000)
  · calc
      _ ≤ _ := total_scaled_le notes (note o) _ _ (perNote o ho)
      _ ≤ (notes.length : Int) * (1000 * (2^43 * units)) :=
        Int.mul_le_mul_of_nonneg_left
          (Int.le_trans factor (Int.mul_le_mul_of_nonneg_left budget (by decide))) (by omega)
      _ = _ := by simp only [Int.mul_assoc, Int.mul_comm, Int.mul_left_comm]
  · exact Int.mul_pos (Int.mul_pos hn hu) (by decide)

def measurements (d : TeamData) (p : Plan) (multi : Bool) : Values :=
  let own := mean d p
  ⟨own, if multi then d.room p own else own, d.bonus, d.support⟩

private def centered (leader : Nat) : Order :=
  let rest := (List.range 5).erase leader
  rest.take 2 ++ [leader] ++ rest.drop 2

def result (ops : RoundedPoints.Ops Nat) (goal : Target) (multi : Bool)
    (cfg : Nat) (ids : List Nat) (d : TeamData) (p : Plan) : Search.Candidate :=
  let v := measurements d p multi
  let actors := if multi then centered p.leader else p.seats
  let orderedIds := ids.mergeSort
  ⟨objective ops goal v, v.own, d.power p.leader,
    actors.map (fun i => orderedIds[i]?.getD 0), if multi then p.seats else [], cfg⟩

structure Request where
  configurations : List Nat
  groups : List (List Nat)
  multi : Bool
  data : Nat → List Nat → TeamData

def evaluate (req : Request) (ops : RoundedPoints.Ops Nat) (goal : Target)
    (cfg : Nat) (ids : List Nat) : List Search.Candidate :=
  let d := req.data cfg ids
  (plans req.multi d.eligible).map (result ops goal req.multi cfg ids d)

def Feasible (req : Request) (ops : RoundedPoints.Ops Nat) (goal : Target)
    (s : Search.Candidate) : Prop :=
  ∃ cfg ∈ req.configurations, ∃ ids, Search.Selects req.groups 5 ids ∧
    ∃ p, Allowed req.multi (req.data cfg ids).eligible p ∧
      result ops goal req.multi cfg ids (req.data cfg ids) p = s

private theorem legal_feasible {req ops goal s} :
    Search.Legal req.configurations req.groups (evaluate req ops goal) s ↔ Feasible req ops goal s := by
  simp only [Search.Legal, Feasible, evaluate, List.mem_map, plans_complete]

/-- A proposal consists of bounds on physical inputs to the objective, in
    their proper units. It need not assume that the incumbent is optimal. -/
structure Ceilings where
  own : Nat
  other : Nat
  bonus : Nat
  support : Nat

def Encloses (ops : RoundedPoints.Ops Nat) (goal : Target) (c : Ceilings) (v : Values) : Prop :=
  v.own ≤ c.own ∧ match goal with
    | .score => True
    | .event rule => RoundedPoints.RoomEnclosure ops rule v.own v.room c.own c.other ∧
        v.bonus ≤ c.bonus ∧ v.support ≤ c.support

def ceiling (ops : RoundedPoints.Ops Nat) : Target → Ceilings → Nat
  | .score, c => c.own
  | .event rule, c => RoundedPoints.upper ops rule c.own c.other c.bonus c.support

theorem target_bounded (ops) (laws : RoundedPoints.Ordered ops)
    (goal c v) (h : Encloses ops goal c v) : objective ops goal v ≤ ceiling ops goal c := by
  cases goal with
  | score => exact h.1
  | event rule =>
    obtain ⟨hs, hr, hb, hp⟩ := h
    exact RoundedPoints.points_le_upper laws rule hs hr hb hp

/-- Combine the two separately maximized suffix tables *in the same bin*
    with the event bound. `encode` converts a product in the envelope's
    fixed units to an ordered score key, monotonically. The leaf hypotheses
    are on its own uncapped score, other-player term, bonus, and support. -/
theorem binned_target_upper (ops) (laws : RoundedPoints.Ordered ops) (rule)
    {pg sg count leaders bin p k pHi kHi}
    (hp : Bounds.Completion pg count 0 bin p) (hk : Bounds.Completion sg count leaders bin k)
    (ptab : Bounds.suffix pg count 0 bin = some pHi)
    (ktab : Bounds.suffix sg count leaders bin = some kHi)
    (fixedP fixedK : Nat) (encode : Nat → Nat)
    (mono : ∀ {a b}, a ≤ b → encode a ≤ encode b)
    (v : Values) (otherHi bonusHi supportHi : Nat)
    (hs : v.own ≤ encode ((fixedP + p) * (fixedK + k)))
    (hr : RoundedPoints.RoomEnclosure ops rule v.own v.room
      (encode ((fixedP + pHi) * (fixedK + kHi))) otherHi)
    (hb : v.bonus ≤ bonusHi) (hsp : v.support ≤ supportHi) :
    objective ops (.event rule) v ≤ RoundedPoints.upper ops rule
      (encode ((fixedP + pHi) * (fixedK + kHi))) otherHi bonusHi supportHi :=
  RoundedPoints.points_le_upper laws rule
    (Nat.le_trans hs (mono (Bounds.binned_product hp hk ptab ktab fixedP fixedK))) hr hb hsp

inductive Proposal where
  | unknown
  | impossible
  | bounded (c : Ceilings)

def Proposal.hint (ops : RoundedPoints.Ops Nat) (goal : Target) : Proposal → Search.Hint
  | .unknown => .unknown
  | .impossible => .impossible
  | .bounded c => .upper (ceiling ops goal c)

def Supported (ops : RoundedPoints.Ops Nat) (goal : Target) (p : Search.Candidate → Prop) : Proposal → Prop
  | .unknown => True
  | .impossible => ∀ a, ¬ p a
  | .bounded c => ∀ a, p a → ∃ v, a.target = (objective ops goal v : Int) ∧ Encloses ops goal c v

def policy (ops) (laws : RoundedPoints.Ordered ops) (goal)
    (propose : Search.Tree → Search.Tree → Proposal)
    (localBounds : ∀ l r, Search.Valid l → Search.Valid r →
      Supported ops goal (fun a => Search.Contains l a ∨ Search.Contains r a) (propose l r)) :
    Search.Policy where
  hint l r := (propose l r).hint ops goal
  safe l r hl hr := by
    have h := localBounds l r hl hr
    cases hp : propose l r with
    | unknown => trivial
    | impossible => rw [hp] at h; exact h
    | bounded c =>
      simp only [hp, Supported] at h
      intro a ha
      obtain ⟨v, he, hv⟩ := h a ha
      rw [he]
      exact Int.ofNat_le.mpr (target_bounded ops laws goal c v hv)

def tree (req : Request) (ops goal) (p : Search.Policy) :=
  Search.space p.hint req.configurations req.groups (evaluate req ops goal)

/-- With `goal = .score` this ranks song means. With `.event rule` it applies
    the rule once to the mean. If there is no Pt rule (including score-linked
    versus/FES), callers use `.score`. Ties include the mean, power and IDs. -/
theorem single_exact (req ops goal) (p : Search.Policy) (stop out)
    (finished : Search.run stop (tree req ops goal p) none = .exact out) :
    Search.Optimal (Feasible req ops goal) out := by
  rw [← Search.completed finished]
  simpa only [tree, Search.Optimal, legal_feasible] using
    Search.single_top_one p.hint req.configurations req.groups (evaluate req ops goal)
      (p.space_valid _ _ _)

theorem single_exact_none (req ops goal p stop)
    (finished : Search.run stop (tree req ops goal p) none = .exact none) :
    ∀ s, ¬ Feasible req ops goal s := by
  intro s hs
  obtain ⟨_, h, _⟩ := (single_exact _ _ _ _ _ _ finished).2 s hs
  contradiction

/-- The best retained result at any positive result limit has the same
    full-space optimality guarantee. The trace records only visited leaves. -/
theorem single_retained (req ops goal p) {limit : Nat} (limitPositive : 0 < limit) :
    Search.Optimal (Feasible req ops goal)
      (Retention.kept limit (Retention.trace (tree req ops goal p) none).2).head? := by
  simpa only [tree, Search.Optimal, Search.space_contains, legal_feasible] using
    Retention.retained_search_optimal limitPositive (tree req ops goal p)
      (Search.Policy.space_valid p _ _ _)

end Bandori.Single
