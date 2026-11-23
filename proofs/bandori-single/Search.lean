import Std

/-! Top-1 semantics of the single-song search on normalized inputs. Scores
    and powers are represented by order-preserving integer keys. -/
namespace Bandori.Single.Search

/-- Descending lexicographic order. Negated identifiers encode ascending ties. -/
def atLeast : List Int → List Int → Bool
  | _, [] => true
  | [], _ :: _ => false
  | a :: as, b :: bs =>
    if a = b then atLeast as bs else decide (b < a)

theorem atLeast_total (a b : List Int) : atLeast a b = true ∨ atLeast b a = true := by
  induction a generalizing b with
  | nil => cases b <;> simp [atLeast]
  | cons a as ih =>
    cases b with
    | nil => simp [atLeast]
    | cons b bs =>
      by_cases h : a = b
      · subst b
        simpa [atLeast] using ih bs
      · simp [atLeast, h, Ne.symm h]
        omega

theorem atLeast_trans {a b c : List Int} (hab : atLeast a b = true)
    (hbc : atLeast b c = true) : atLeast a c = true := by
  induction a generalizing b c with
  | nil => cases b <;> cases c <;> simp_all [atLeast]
  | cons a as ih =>
    cases b with
    | nil => cases c <;> simp_all [atLeast]
    | cons b bs =>
      cases c with
      | nil => rfl
      | cons c cs =>
        by_cases ab : a = b <;> by_cases bc : b = c
        · subst b; subst c
          simpa [atLeast] using ih (by simpa [atLeast] using hab) (by simpa [atLeast] using hbc)
        · subst b; simpa [atLeast, bc] using hbc
        · subst c; simpa [atLeast, ab] using hab
        · simp [atLeast, ab] at hab
          simp [atLeast, bc] at hbc
          have h : c < a := by omega
          simp [atLeast, Int.ne_of_gt h, h]

structure Candidate where
  target : Int
  average : Int
  power : Int
  cards : List Nat
  room : List Nat
  configuration : Nat

/-- For one request, all card lists have length five, and all room lists have
    the same length (zero or five), as in the Rust comparator. -/
def key (s : Candidate) : List Int :=
  [s.target, s.average, s.power] ++ s.cards.map (fun (id : Nat) => -(id : Int)) ++
    s.room.map (fun (id : Nat) => -(id : Int)) ++ [-(s.configuration : Int)]

def wins (a b : Candidate) : Prop := atLeast (key a) (key b) = true

theorem wins_refl (a : Candidate) : wins a a :=
  (atLeast_total (key a) (key a)).elim id id

theorem wins_trans {a b c : Candidate} : wins a b → wins b c → wins a c :=
  atLeast_trans

theorem better_target {a b : Candidate} (h : b.target < a.target) : wins a b := by
  simp [wins, key, atLeast, Int.ne_of_gt h, h]

inductive Hint where
  | unknown
  | impossible
  | upper (value : Int)

inductive Tree where
  | empty
  | leaf (candidate : Candidate)
  | branch (hint : Hint) (left right : Tree)

def Contains : Tree → Candidate → Prop
  | .empty, _ => False
  | .leaf a, s => s = a
  | .branch _ l r, s => Contains l s ∨ Contains r s

def Hint.Sound (h : Hint) (p : Candidate → Prop) : Prop :=
  match h with
  | .unknown => True
  | .impossible => ∀ a, ¬ p a
  | .upper u => ∀ a, p a → a.target ≤ u

def Valid : Tree → Prop
  | .empty | .leaf _ => True
  | .branch h l r => h.Sound (Contains (.branch h l r)) ∧ Valid l ∧ Valid r

def cut : Hint → Option Candidate → Bool
  | .impossible, _ => true
  | .upper u, some a => decide (u < a.target)
  | _, _ => false

def retain (best : Option Candidate) (a : Candidate) : Option Candidate :=
  match best with
  | none => some a
  | some b => if atLeast (key b) (key a) then some b else some a

def search : Tree → Option Candidate → Option Candidate
  | .empty, best => best
  | .leaf a, best => retain best a
  | .branch h l r, best =>
    if cut h best then best else search r (search l best)

/-- Both directions matter: an optimum is attainable, and every legal
    competitor is covered. Together they also characterize an empty result. -/
def Optimal (p : Candidate → Prop) (out : Option Candidate) : Prop :=
  (∀ a, out = some a → p a) ∧
  (∀ a, p a → ∃ b, out = some b ∧ wins b a)

private theorem retained (inc : Option Candidate) (a : Candidate) :
    Optimal (fun s => inc = some s ∨ s = a) (retain inc a) := by
  cases inc with
  | none =>
    constructor
    · intro s hs; exact Or.inr (Option.some.inj hs).symm
    · intro s hs; rcases hs with hs | rfl
      · contradiction
      · exact ⟨_, rfl, wins_refl _⟩
  | some b =>
    cases h : atLeast (key b) (key a) with
    | true =>
      simp [retain, h, Optimal]
      intro s hs
      rcases hs with hs | hs
      · subst s; exact wins_refl _
      · subst s; exact h
    | false =>
      have hab : wins a b := (atLeast_total (key b) (key a)).resolve_left (by simp [h])
      simp [retain, h, Optimal]
      intro s hs
      rcases hs with hs | hs
      · subst s; exact hab
      · subst s; exact wins_refl _

private theorem skipped {p : Candidate → Prop} {h : Hint} {inc : Option Candidate}
    (sound : h.Sound p) (hc : cut h inc = true) :
    Optimal (fun s => inc = some s ∨ p s) inc := by
  constructor
  · intro a ha; exact Or.inl ha
  · intro a ha
    rcases ha with ha | ha
    · exact ⟨a, ha, wins_refl _⟩
    · cases h with
      | unknown => cases inc <;> contradiction
      | impossible => exact False.elim (sound a ha)
      | upper u =>
        cases inc with
        | none => contradiction
        | some b =>
          have hlow : a.target ≤ u := sound a ha
          have hhigh : u < b.target := by simpa [cut] using hc
          exact ⟨b, rfl, better_target (by omega)⟩

theorem search_optimal (t : Tree) (inc : Option Candidate) (hv : Valid t) :
    Optimal (fun s => inc = some s ∨ Contains t s) (search t inc) := by
  induction t generalizing inc with
  | empty =>
    constructor
    · intro a ha; exact Or.inl ha
    · intro a ha; exact ⟨a, ha.resolve_right id, wins_refl _⟩
  | leaf a => exact retained inc a
  | branch h l r il ir =>
    rcases hv with ⟨hh, hl, hr⟩
    simp only [search]
    split
    next hc => exact skipped hh hc
    next =>
      obtain ⟨lf, lb⟩ := il inc hl
      obtain ⟨rf, rb⟩ := ir (search l inc) hr
      constructor
      · intro a ha
        rcases rf a ha with ha | ha
        · rcases lf a ha with hi | hm
          · exact Or.inl hi
          · exact Or.inr (Or.inl hm)
        · exact Or.inr (Or.inr ha)
      · intro a ha
        have fromLeft (ha : inc = some a ∨ Contains l a) :
            ∃ b, search r (search l inc) = some b ∧ wins b a := by
          obtain ⟨b, hb, hba⟩ := lb a ha
          obtain ⟨c, hc, hcb⟩ := rb b (Or.inl hb)
          exact ⟨c, hc, wins_trans hcb hba⟩
        rcases ha with hi | hm
        · exact fromLeft (Or.inl hi)
        · rcases hm with hl | hr
          · exact fromLeft (Or.inr hl)
          · exact rb a (Or.inr hr)

theorem exact_best {t : Tree} (hv : Valid t) {best : Candidate}
    (h : search t none = some best) :
    Contains t best ∧ ∀ a, Contains t a → wins best a := by
  obtain ⟨hf, hb⟩ := search_optimal t none hv
  refine ⟨(hf best h).resolve_left (by simp), ?_⟩
  intro a ha
  obtain ⟨b, heq, hw⟩ := hb a (Or.inr ha)
  rw [h] at heq
  cases heq
  exact hw

theorem exact_none_iff {t : Tree} (hv : Valid t) :
    search t none = none ↔ ∀ a, ¬ Contains t a := by
  obtain ⟨hf, hb⟩ := search_optimal t none hv
  constructor
  · intro h a ha
    obtain ⟨b, heq, _⟩ := hb a (Or.inr ha)
    simp [h] at heq
  · intro empty
    cases heq : search t none with
    | none => rfl
    | some b => exact False.elim ((empty b) ((hf b heq).resolve_left (by simp)))

/-- A stop can stand for cancellation, budget exhaustion, or failed arithmetic
    at any visited node. An incomplete child prevents an exact parent result. -/
inductive Outcome where
  | exact (best : Option Candidate)
  | incomplete (bestSoFar : Option Candidate)

def run (stop : Tree → Bool) (t : Tree) (inc : Option Candidate) : Outcome :=
  if stop t then .incomplete inc else
    match t with
    | .empty => .exact inc
    | .leaf a => .exact (retain inc a)
    | .branch h l r =>
      if cut h inc then .exact inc else
        match run stop l inc with
        | .incomplete b => .incomplete b
        | .exact b => run stop r b

theorem completed {stop t inc out} (h : run stop t inc = .exact out) :
    search t inc = out := by
  induction t generalizing inc out with
  | empty => cases hs : stop .empty <;> simp_all [run, search]
  | leaf a => cases hs : stop (.leaf a) <;> simp_all [run, search]
  | branch b l r il ir =>
    rw [run] at h
    split at h
    · contradiction
    · simp only [search]
      split at h
      next hc => simpa [hc] using h
      next hc =>
        simp only [if_neg hc]
        cases hl : run stop l inc with
        | incomplete _ => simp [hl] at h
        | exact a =>
          rw [il hl]
          exact ir (by simpa [hl] using h)

/-- One physical card per selected character, in character-group order. The
    input groups already exclude disabled cards and partition the active roster. -/
inductive Selects : List (List Nat) → Nat → List Nat → Prop where
  | done : Selects [] 0 []
  | skip : Selects gs k ids → Selects (g :: gs) k ids
  | take : c ∈ g → Selects gs k ids → Selects (g :: gs) (k + 1) (c :: ids)

theorem selects_length {gs k ids} (h : Selects gs k ids) : ids.length = k := by
  induction h with
  | done => rfl
  | skip _ ih => exact ih
  | take _ _ ih => simp [ih]

theorem selects_zero {gs ids} (h : Selects gs 0 ids) : ids = [] :=
  List.length_eq_zero_iff.mp (selects_length h)

theorem selects_empty (gs) : Selects gs 0 [] := by
  induction gs with
  | nil => exact .done
  | cons _ _ ih => exact .skip ih

def forest (hint : Tree → Tree → Hint) : List Tree → Tree
  | [] => .empty
  | t :: ts =>
    let r := forest hint ts
    .branch (hint t r) t r

theorem forest_contains (hint) (ts : List Tree) (s : Candidate) :
    Contains (forest hint ts) s ↔ ∃ t ∈ ts, Contains t s := by
  induction ts with
  | nil => simp [forest, Contains]
  | cons t ts ih =>
    simp only [forest, Contains, ih, List.mem_cons]
    constructor
    · rintro (hl | ⟨t', ht, hs⟩)
      · exact ⟨t, Or.inl rfl, hl⟩
      · exact ⟨t', Or.inr ht, hs⟩
    · rintro ⟨t', rfl | ht, hs⟩
      · exact Or.inl hs
      · exact Or.inr ⟨t', ht, hs⟩

/-- Binary skip/take representation of the increasing-group search. `finish`
    contains the legal evaluated formations for the completed card selection. -/
def teams (hint : Tree → Tree → Hint) :
    List (List Nat) → Nat → (List Nat → Tree) → Tree
  | [], 0, finish => finish []
  | [], _ + 1, _ => .empty
  | _ :: _, 0, finish => finish []
  | g :: gs, k + 1, finish =>
    let skip := teams hint gs (k + 1) finish
    let take := forest hint (g.map fun c => teams hint gs k (fun tail => finish (c :: tail)))
    .branch (hint skip take) skip take

theorem teams_contains (hint) (gs k finish s) :
    Contains (teams hint gs k finish) s ↔ ∃ ids, Selects gs k ids ∧ Contains (finish ids) s := by
  induction gs generalizing k finish with
  | nil =>
    cases k with
    | zero =>
      constructor
      · intro hs; exact ⟨[], .done, hs⟩
      · rintro ⟨ids, h, hs⟩; cases h; exact hs
    | succ k =>
      constructor
      · exact False.elim
      · rintro ⟨ids, h, _⟩; cases h
  | cons g gs ih =>
    cases k with
    | zero =>
      constructor
      · intro hs; exact ⟨[], selects_empty _, hs⟩
      · rintro ⟨ids, h, hs⟩
        rw [selects_zero h] at hs
        exact hs
    | succ k =>
      simp only [teams, Contains, forest_contains]
      constructor
      · rintro (hs | ⟨t, ht, hs⟩)
        · obtain ⟨ids, ht, hs'⟩ := (ih _ _).mp hs
          exact ⟨ids, .skip ht, hs'⟩
        · obtain ⟨c, hc, rfl⟩ := List.mem_map.mp ht
          obtain ⟨tail, ht, hs'⟩ := (ih _ _).mp hs
          exact ⟨c :: tail, .take hc ht, hs'⟩
      · rintro ⟨ids, ht, hs⟩
        cases ht with
        | skip h => exact Or.inl ((ih _ _).mpr ⟨ids, h, hs⟩)
        | take hc h =>
          exact Or.inr ⟨_, List.mem_map.mpr ⟨_, hc, rfl⟩, (ih _ _).mpr ⟨_, h, hs⟩⟩

def space (hint : Tree → Tree → Hint) (configs : List Nat) (gs : List (List Nat))
    (evaluate : Nat → List Nat → List Candidate) : Tree :=
  forest hint (configs.map fun cfg =>
    teams hint gs 5 (fun ids => forest hint ((evaluate cfg ids).map Tree.leaf)))

def Legal (configs : List Nat) (gs : List (List Nat)) (evaluate : Nat → List Nat → List Candidate)
    (s : Candidate) : Prop :=
  ∃ cfg ∈ configs, ∃ ids, Selects gs 5 ids ∧ s ∈ evaluate cfg ids

theorem space_contains (hint configs gs evaluate s) :
    Contains (space hint configs gs evaluate) s ↔ Legal configs gs evaluate s := by
  unfold space Legal
  rw [forest_contains]
  constructor
  · rintro ⟨t, ht, hs⟩
    obtain ⟨cfg, hc, rfl⟩ := List.mem_map.mp ht
    obtain ⟨ids, hi, hs⟩ := (teams_contains ..).mp hs
    obtain ⟨t, ht, hs⟩ := (forest_contains ..).mp hs
    obtain ⟨a, ha, rfl⟩ := List.mem_map.mp ht
    exact ⟨cfg, hc, ids, hi, (show s = a from hs) ▸ ha⟩
  · rintro ⟨cfg, hc, ids, hi, hs⟩
    refine ⟨_, List.mem_map.mpr ⟨cfg, hc, rfl⟩, (teams_contains ..).mpr ⟨ids, hi, ?_⟩⟩
    exact (forest_contains ..).mpr ⟨_, List.mem_map.mpr ⟨s, hs, rfl⟩, rfl⟩

/-- Top-1 for the specified card/configuration space, including ties and no
    solution. Only a completed search supplies its result to this theorem. -/
theorem single_top_one (hint configs gs evaluate)
    (sound : Valid (space hint configs gs evaluate)) :
    Optimal (Legal configs gs evaluate) (search (space hint configs gs evaluate) none) := by
  simpa [space_contains] using
    search_optimal (space hint configs gs evaluate) none sound

/-- Prove the search invariant locally when constructing a branch. An unknown
    bound needs no numeric evidence and keeps both children open. -/
structure Policy where
  hint : Tree → Tree → Hint
  safe : ∀ l r, Valid l → Valid r →
    (hint l r).Sound (fun a => Contains l a ∨ Contains r a)

def Policy.noPruning : Policy := ⟨fun _ _ => .unknown, fun _ _ _ _ => True.intro⟩

theorem Policy.forest_valid (p : Policy) (ts : List Tree)
    (h : ∀ t ∈ ts, Valid t) : Valid (forest p.hint ts) := by
  induction ts with
  | nil => trivial
  | cons t ts ih =>
    have hl := h t (by simp)
    have hr := ih (fun a ha => h a (by simp [ha]))
    exact ⟨p.safe _ _ hl hr, hl, hr⟩

theorem Policy.teams_valid (p : Policy) (gs k finish)
    (h : ∀ ids, Valid (finish ids)) : Valid (teams p.hint gs k finish) := by
  induction gs generalizing k finish with
  | nil => cases k with
           | zero => exact h []
           | succ _ => trivial
  | cons g gs ih =>
    cases k with
    | zero => exact h []
    | succ k =>
      have hl := ih (k + 1) finish h
      have hr : Valid (forest p.hint (g.map fun c =>
          teams p.hint gs k (fun ids => finish (c :: ids)))) := by
        apply p.forest_valid
        intro t ht
        obtain ⟨c, _, rfl⟩ := List.mem_map.mp ht
        exact ih k _ (fun ids => h (c :: ids))
      exact ⟨p.safe _ _ hl hr, hl, hr⟩

theorem Policy.space_valid (p : Policy) (configs gs evaluate) :
    Valid (space p.hint configs gs evaluate) := by
  apply p.forest_valid
  intro t ht
  obtain ⟨cfg, _, rfl⟩ := List.mem_map.mp ht
  apply p.teams_valid
  intro ids
  apply p.forest_valid
  intro t ht
  obtain ⟨_, _, rfl⟩ := List.mem_map.mp ht
  trivial

end Bandori.Single.Search
