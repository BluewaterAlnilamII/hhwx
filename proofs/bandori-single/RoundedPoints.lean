import EventPoints

/-!
Operation-ordered Pt settlement for finite, nonnegative inputs. The executable
Float interpretation and the theorem about nonnegative ordered ranks use the
same expressions. The theorem requires the recorded primitive arithmetic laws
and bounds from the caller. It does not identify opaque Lean Float primitives
with an independently formalized implementation of IEEE 754.
-/
namespace Bandori.Single.RoundedPoints

/-- Normal-event coefficients use the same representation as score and room
values. The Rust input permits a finite fractional base or positive divisor. -/
abbrev Rule (α : Type) := EventPoints.RuleFor α

structure Ops (α : Type) where
  lit : Nat → α
  add : α → α → α
  mul : α → α → α
  div : α → α → α
  sub0 : α → α → α
  floor : α → α
  up : α → α

private def credit (r : Ops α) (divisor : α) (tier : Nat) (score : α) : α :=
  r.floor (r.mul (r.div (r.div score divisor) (r.lit tier)) (r.lit 100))

/-- Rust's left-to-right accumulator, including its early break and final
    unbounded tier. All caps are widths in points, separately converted. -/
private def accumulate [LE α] [DecidableLE α] (r : Ops α) (divisor : α) :
    List Nat → Nat → α → α → α
  | [], tier, remaining, total => r.add total (credit r divisor tier remaining)
  | w :: ws, tier, remaining, total =>
    if remaining ≤ r.lit w then r.add total (credit r divisor tier remaining)
    else accumulate r divisor ws (tier+1) (r.sub0 remaining (r.lit w))
      (r.add total (credit r divisor tier (r.lit w)))

private def softCap [LE α] [DecidableLE α] (r : Ops α) (divisor : α)
    (caps : List Nat) (score : α) : α :=
  r.floor (r.div (accumulate r divisor caps 1 score (r.lit 0)) (r.lit 100))

def basePoints [LE α] [DecidableLE α] (r : Ops α) : Rule α → α → α → α
  | .normal0 b d, own, other | .normal2 b d, own, other =>
    r.add b (r.add (r.floor (r.div own d))
      (r.floor (r.div (r.div other d) (r.lit 10))))
  | .normal1 b d, own, other =>
    r.add b (r.add (softCap r d [1600000, 150000, 250000, 400000] own)
      (softCap r (r.mul d (r.lit 10)) [6400000, 600000, 1000000, 1600000] other))
  | .challengeLegacy, own, _ =>
    r.add (r.lit 1000) (softCap r (r.lit 300) [2100000, 150000, 250000] own)
  | .challengeModern, own, _ =>
    r.add (r.lit 3250) (r.floor (r.div own (r.lit 450)))

private def actualTerms [Min α] (r : Ops α) : Rule α → α → α → α × α
  | .normal0 _ _, own, room =>
    let ownCapped := min own (r.lit 1500000)
    (ownCapped, r.sub0 (min room (r.lit 7500000)) ownCapped)
  | _, own, room => (own, r.sub0 room own)

private def upperTerms [Min α] (r : Ops α) : Rule α → α → α → α × α
  | .normal0 _ _, own, other =>
    (min own (r.lit 1500000), min (r.add own other) (r.lit 7500000))
  | _, own, other => (own, other)

/-- The leaf path has no nextUp steps. -/
def points [LE α] [DecidableLE α] [Min α] (r : Ops α) (rule : Rule α)
    (own room bonus support : α) : α :=
  let p := actualTerms r rule own room
  let base := basePoints r rule p.1 p.2
  r.add (r.floor (r.mul base (r.add (r.lit 1) bonus)))
    (r.floor (r.div support (r.lit 3000)))

/-- The upper path advances the rounded bonus factor, product, and support
    quotient before the indicated floors, as in single_event.rs. -/
def upper [LE α] [DecidableLE α] [Min α] (r : Ops α) (rule : Rule α)
    (own other bonus support : α) : α :=
  let p := upperTerms r rule own other
  let base := basePoints r rule p.1 p.2
  r.add (r.floor (r.up (r.mul base (r.up (r.add (r.lit 1) bonus)))))
    (r.floor (r.up (r.div support (r.lit 3000))))

/-- Ranks identify the order of nonnegative finite binary64 values (zero is
    canonicalized). These hypotheses are on primitives, not on whole formulas.
    For a total rank model one may extend operations outside the finite paths
    being compared, provided the extension preserves these hypotheses. -/
structure Ordered (r : Ops Nat) : Prop where
  add_mono : ∀ {a b x y}, a ≤ b → x ≤ y → r.add a x ≤ r.add b y
  add_ge : ∀ a b, a ≤ r.add a b
  mul_mono : ∀ {a b x y}, a ≤ b → x ≤ y → r.mul a x ≤ r.mul b y
  div_mono : ∀ {a b} d, a ≤ b → r.div a d ≤ r.div b d
  sub_mono : ∀ {a b} d, a ≤ b → r.sub0 a d ≤ r.sub0 b d
  sub_le : ∀ a b, r.sub0 a b ≤ a
  floor_mono : ∀ {a b}, a ≤ b → r.floor a ≤ r.floor b
  le_up : ∀ a, a ≤ r.up a

private theorem credit_mono {r : Ops Nat} (laws : Ordered r) (d tier : Nat)
    {x y : Nat} (h : x ≤ y) : credit r d tier x ≤ credit r d tier y :=
  laws.floor_mono (laws.mul_mono (laws.div_mono _ (laws.div_mono _ h)) (Nat.le_refl _))

private theorem total_le_accumulate {r : Ops Nat} (laws : Ordered r) (d : Nat)
    (ws : List Nat) (tier score total : Nat) : total ≤ accumulate r d ws tier score total := by
  induction ws generalizing tier score total with
  | nil => exact laws.add_ge _ _
  | cons w ws ih =>
    simp only [accumulate]
    split
    · exact laws.add_ge _ _
    · exact Nat.le_trans (laws.add_ge _ _) (ih _ _ _)

private theorem accumulate_mono {r : Ops Nat} (laws : Ordered r) (d : Nat)
    (ws : List Nat) (tier : Nat) {x y total totalHi : Nat} (hs : x ≤ y) (ht : total ≤ totalHi) :
    accumulate r d ws tier x total ≤ accumulate r d ws tier y totalHi := by
  induction ws generalizing tier x y total totalHi with
  | nil => exact laws.add_mono ht (credit_mono laws _ _ hs)
  | cons w ws ih =>
    simp only [accumulate]
    by_cases hx : x ≤ r.lit w
    · rw [if_pos hx]
      split
      · exact laws.add_mono ht (credit_mono laws _ _ hs)
      · exact Nat.le_trans (laws.add_mono ht (credit_mono laws _ _ hx))
          (total_le_accumulate laws _ _ _ _ _)
    · rw [if_neg hx, if_neg (show ¬ y ≤ r.lit w by omega)]
      exact ih _ (laws.sub_mono _ hs) (laws.add_mono ht (Nat.le_refl _))

private theorem softCap_mono {r : Ops Nat} (laws : Ordered r) (d : Nat)
    (ws : List Nat) {x y : Nat} (h : x ≤ y) : softCap r d ws x ≤ softCap r d ws y :=
  laws.floor_mono (laws.div_mono _ (accumulate_mono laws _ _ _ h (Nat.le_refl _)))

theorem basePoints_mono {r : Ops Nat} (laws : Ordered r) (rule : Rule Nat)
    {s s' o o' : Nat} (hs : s ≤ s') (ho : o ≤ o') :
    basePoints r rule s o ≤ basePoints r rule s' o' := by
  cases rule with
  | normal0 b d | normal2 b d =>
    exact laws.add_mono (Nat.le_refl _) (laws.add_mono (laws.floor_mono (laws.div_mono _ hs))
      (laws.floor_mono (laws.div_mono _ (laws.div_mono _ ho))))
  | normal1 b d =>
    exact laws.add_mono (Nat.le_refl _) (laws.add_mono (softCap_mono laws _ _ hs)
      (softCap_mono laws _ _ ho))
  | challengeLegacy => exact laws.add_mono (Nat.le_refl _) (softCap_mono laws _ _ hs)
  | challengeModern => exact laws.add_mono (Nat.le_refl _) (laws.floor_mono (laws.div_mono _ hs))

/-- Up to the own cap the solo residual subtracts a score from itself.
    Above it only the capped room grows; its subtrahend stays fixed. -/
private theorem soloResidual_mono {r : Ops Nat} (laws : Ordered r)
    (selfZero : ∀ s, r.sub0 s s = 0) {small large x y : Nat}
    (caps : small ≤ large) (h : x ≤ y) :
    r.sub0 (min x large) (min x small) ≤ r.sub0 (min y large) (min y small) := by
  by_cases hsmall : x ≤ small
  · rw [Nat.min_eq_left (Nat.le_trans hsmall caps), Nat.min_eq_left hsmall, selfZero]
    exact Nat.zero_le _
  · rw [Nat.min_eq_right (show small ≤ x by omega),
        Nat.min_eq_right (show small ≤ y by omega)]
    apply laws.sub_mono
    omega

/-- With the same five cards, configuration and support, a solo formation
    maximizing average score also maximizes Pt. This argument uses room=own;
    it gives no analogous reduction for a multiplayer formation. -/
theorem solo_points_mono {r : Ops Nat} (laws : Ordered r)
    (selfZero : ∀ s, r.sub0 s s = 0) (caps : r.lit 1500000 ≤ r.lit 7500000)
    (rule : Rule Nat) (bonus support : Nat) {x y : Nat} (h : x ≤ y) :
    points r rule x x bonus support ≤ points r rule y y bonus support := by
  apply laws.add_mono _ (Nat.le_refl _)
  apply laws.floor_mono
  apply laws.mul_mono _ (Nat.le_refl _)
  cases rule with
  | normal0 b d =>
    apply basePoints_mono laws
    · simp only [actualTerms]; omega
    · exact soloResidual_mono laws selfZero caps h
  | normal1 b d | normal2 b d | challengeLegacy | challengeModern =>
    apply basePoints_mono laws _ h
    simp only [actualTerms, selfZero, Nat.le_refl]

/-- Actual ordering compares Pt first and expected score second. When both
    agree, subsequent stable tie fields must still be preserved. -/
theorem solo_points_and_score_dominate {r : Ops Nat} (laws : Ordered r)
    (selfZero : ∀ s, r.sub0 s s = 0) (caps : r.lit 1500000 ≤ r.lit 7500000)
    (rule : Rule Nat) (bonus support : Nat) {x y : Nat} (h : x ≤ y) :
    points r rule x x bonus support < points r rule y y bonus support ∨
    (points r rule x x bonus support = points r rule y y bonus support ∧ x ≤ y) := by
  have := solo_points_mono laws selfZero caps rule bonus support h
  omega

/-- Rank and win offsets are chosen by the display option. For FES, each
    rounded addition is performed in its original order. -/
def rankedPoints [LE α] [DecidableLE α] (r : Ops α) (festival modern : Bool)
    (rankOffset winOffset boost score : α) : α :=
  let component := if modern then r.floor (r.div score (r.lit 6500)) else
    softCap r (r.lit 5500) (if festival then [2625000, 187500, 312500]
      else [2100000, 150000, 250000]) score
  let adjusted := if festival then
    r.add (r.add component (r.lit (if modern then 50 else 20))) winOffset
    else component
  r.mul (r.add adjusted rankOffset) boost

theorem rankedPoints_mono {r : Ops Nat} (laws : Ordered r) (festival modern : Bool)
    (rankOffset winOffset boost : Nat) {x y : Nat} (h : x ≤ y) :
    rankedPoints r festival modern rankOffset winOffset boost x ≤
    rankedPoints r festival modern rankOffset winOffset boost y := by
  apply laws.mul_mono _ (Nat.le_refl _)
  apply laws.add_mono _ (Nat.le_refl _)
  cases festival <;> cases modern <;>
    first
    | exact laws.floor_mono (laws.div_mono _ h)
    | exact softCap_mono laws _ _ h
    | exact laws.add_mono (laws.add_mono (laws.floor_mono (laws.div_mono _ h)) (Nat.le_refl _))
        (Nat.le_refl _)
    | exact laws.add_mono (laws.add_mono (softCap_mono laws _ _ h) (Nat.le_refl _))
        (Nat.le_refl _)

/-- The calling search must supply a room enclosure for the capped formula,
    and an independent enclosure of the clamped residual for normal 1/2. -/
def RoomEnclosure (r : Ops Nat) : Rule Nat → Nat → Nat → Nat → Nat → Prop
  | .normal0 _ _, _, room, sHi, oHi => room ≤ r.add sHi oHi
  | .normal1 _ _, own, room, _, oHi | .normal2 _ _, own, room, _, oHi =>
    r.sub0 room own ≤ oHi
  | _, _, _, _, _ => True

theorem points_le_upper {r : Ops Nat} (laws : Ordered r) (rule : Rule Nat)
    {own room bonus support ownHi otherHi bonusHi supportHi : Nat}
    (hs : own ≤ ownHi) (hr : RoomEnclosure r rule own room ownHi otherHi)
    (hb : bonus ≤ bonusHi) (hp : support ≤ supportHi) :
    points r rule own room bonus support ≤ upper r rule ownHi otherHi bonusHi supportHi := by
  let p := actualTerms r rule own room
  let q := upperTerms r rule ownHi otherHi
  have hBase : basePoints r rule p.1 p.2 ≤ basePoints r rule q.1 q.2 := by
    cases rule with
    | normal0 b d =>
      apply basePoints_mono laws
      · simp only [p, q, actualTerms, upperTerms]; omega
      · simp only [p, q, actualTerms, upperTerms]
        exact Nat.le_trans (laws.sub_le _ _) (by simp only [RoomEnclosure] at hr; omega)
    | normal1 b d | normal2 b d => exact basePoints_mono laws _ hs hr
    | challengeLegacy => exact laws.add_mono (Nat.le_refl _) (softCap_mono laws _ _ hs)
    | challengeModern => exact laws.add_mono (Nat.le_refl _) (laws.floor_mono (laws.div_mono _ hs))
  apply laws.add_mono
  · apply laws.floor_mono
    exact Nat.le_trans (laws.mul_mono hBase
      (Nat.le_trans (laws.add_mono (Nat.le_refl _) hb) (laws.le_up _))) (laws.le_up _)
  · exact laws.floor_mono (Nat.le_trans (laws.div_mono _ hp) (laws.le_up _))

/-- Executable interpretation for finite nonnegative values. Only built-in
    integer literals use UInt64 conversion; the supplied base and divisor
    retain their Float bits. The next-up bit step applies to nonnegative values. -/
def floatOps : Ops Float where
  lit n := n.toUInt64.toFloat
  add := (· + ·)
  mul := (· * ·)
  div := (· / ·)
  sub0 a b := max (a-b) 0
  floor := Float.floor
  up x := Float.ofBits (if x == 0 then 1 else x.toBits + 1)

def floatPoints (rule : Rule Float) (own room bonusRate support : Float) : Float :=
  points floatOps rule own room bonusRate support

/- This runtime regression is separate from the universal kernel proof above.
    100 × round(1 + round(15/100)) rounds to the predecessor of 115. -/
#eval show IO Unit from do
  let bonus : Float := 15.0 / 100.0
  let product := 100.0 * (1.0 + bonus)
  let actual := floatPoints (.normal2 50 10000) 500000 500000 bonus 0
  let bound := upper floatOps (.normal2 50 10000) 500000 0 bonus 0
  unless product.toBits == 0x405cbfffffffffff && actual == 114.0 && bound ≥ 115.0 do
    throw (IO.userError "binary64 event settlement regression")
  -- 25.5 + floor(10/2.5) + floor(((35-10)/2.5)/10), then a 100% bonus.
  unless floatPoints (.normal2 25.5 2.5) 10.0 35.0 1.0 0.0 == 61.0 do
    throw (IO.userError "fractional event coefficients lost precision")

example : EventPoints.points (.normal2 50 10000) (500000 * 1024) (500000 * 1024) 15 0 1 = 115 := by
  decide

end Bandori.Single.RoundedPoints
