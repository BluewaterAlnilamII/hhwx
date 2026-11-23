import Std

/-!
Single-song Pt in the documented mathematical model. A score is its weighted
numerator over the 1024 skill-order paths. The caller computes this numerator
*before* applying an event formula. A room score is supplied in the same units
after room settlement (use the own score for a solo live). Bonus is the already
rounded integer percentage. Support may have any positive denominator.

The released event coefficients are nonnegative integers with positive divisors.
Natural division models exact rational floor. This file does not assert that
binary64 intermediates in Rust always compute those mathematical floors, or
that the game uses the same scoring and event policies.
-/
namespace Bandori.Single.EventPoints

def scale : Nat := 1024

/-- Each finite tier consumes at most its width; the final tier consumes
    everything left. Credits are truncated to hundredths in each tier. -/
def tierHundredths (divisor : Nat) : List Nat → Nat → Nat → Nat
  | [], tier, score => score * 100 / (scale * divisor * tier)
  | width :: rest, tier, score =>
      min score (width * scale) * 100 / (scale * divisor * tier) +
      tierHundredths divisor rest (tier + 1) (score - width * scale)

def softCap (divisor : Nat) (widths : List Nat) (score : Nat) : Nat :=
  tierHundredths divisor widths 1 score / 100

private theorem floor_mono {x y divisor : Nat} (h : x ≤ y) :
    x / divisor ≤ y / divisor := by
  cases divisor with
  | zero => simp
  | succ d =>
    exact (Nat.le_div_iff_mul_le (Nat.succ_pos d)).2
      (Nat.le_trans (Nat.div_mul_le_self x _) h)

private theorem tier_mono (divisor : Nat) (widths : List Nat)
    (tier x y : Nat) (h : x ≤ y) :
    tierHundredths divisor widths tier x ≤ tierHundredths divisor widths tier y := by
  induction widths generalizing tier x y with
  | nil => exact floor_mono (Nat.mul_le_mul_right 100 h)
  | cons width rest ih =>
    apply Nat.add_le_add
    · apply floor_mono
      apply Nat.mul_le_mul_right
      omega
    · apply ih
      omega

theorem softCap_mono {x y : Nat} (h : x ≤ y) (divisor : Nat) (widths : List Nat) :
    softCap divisor widths x ≤ softCap divisor widths y :=
  floor_mono (tier_mono divisor widths 1 x y h)

inductive RuleFor (α : Type) where
  | normal0 (base divisor : α)
  | normal1 (base divisor : α)
  | normal2 (base divisor : α)
  | challengeLegacy
  | challengeModern

/-- The exact-rational version uses the released integer coefficients. -/
abbrev Rule := RuleFor Nat

private def challengeWidths : List Nat := [2100000, 150000, 250000]

/-- The five search formulas. The caller supplies the capped own/other terms
    for normal 0, and the uncapped terms for every other rule. -/
def basePoints : Rule → Nat → Nat → Nat
  | .normal0 base d, own, other | .normal2 base d, own, other =>
      base + own / (scale * d) + other / (scale * (10 * d))
  | .normal1 base d, own, other =>
      base + softCap d [1600000, 150000, 250000, 400000] own +
        softCap (10 * d) [6400000, 600000, 1000000, 1600000] other
  | .challengeLegacy, own, _ => 1000 + softCap 300 challengeWidths own
  | .challengeModern, own, _ => 3250 + own / (scale * 450)

theorem basePoints_mono (rule : Rule) {own ownHi other otherHi : Nat}
    (hs : own ≤ ownHi) (ho : other ≤ otherHi) :
    basePoints rule own other ≤ basePoints rule ownHi otherHi := by
  cases rule with
  | normal0 base d | normal2 base d =>
    exact Nat.add_le_add (Nat.add_le_add_left (floor_mono hs) base)
      (floor_mono ho)
  | normal1 base d =>
    exact Nat.add_le_add (Nat.add_le_add_left (softCap_mono hs _ _) base)
      (softCap_mono ho _ _)
  | challengeLegacy => exact Nat.add_le_add_left (softCap_mono hs _ _) 1000
  | challengeModern => exact Nat.add_le_add_left (floor_mono hs) 3250

/-- The room cap precedes subtraction in the oldest normal formula. -/
def actualTerms : Rule → Nat → Nat → Nat × Nat
  | .normal0 _ _, own, room =>
      (min own (1500000 * scale), min room (7500000 * scale) - min own (1500000 * scale))
  | _, own, room => (own, room - own)

/-- For normal 0 the whole capped room bounds the other-player contribution.
    Subtracting an upper bound on one's own score would be unsound. -/
def upperTerms : Rule → Nat → Nat → Nat × Nat
  | .normal0 _ _, ownHi, otherHi =>
      (min ownHi (1500000 * scale), min (ownHi + otherHi) (7500000 * scale))
  | _, ownHi, otherHi => (ownHi, otherHi)

def settle (base bonusPct supportNum supportDen : Nat) : Nat :=
  base * (100 + bonusPct) / 100 + supportNum / (3000 * supportDen)

theorem settle_mono {base baseHi bonus bonusHi support supportHi : Nat} (den : Nat)
    (hb : base ≤ baseHi) (hr : bonus ≤ bonusHi) (hs : support ≤ supportHi) :
    settle base bonus support den ≤ settle baseHi bonusHi supportHi den := by
  exact Nat.add_le_add (floor_mono (Nat.mul_le_mul hb (Nat.add_le_add_left hr 100)))
    (floor_mono hs)

def points (rule : Rule) (own room bonus support den : Nat) : Nat :=
  let terms := actualTerms rule own room
  settle (basePoints rule terms.1 terms.2) bonus support den

def upper (rule : Rule) (ownHi otherHi bonusHi supportHi den : Nat) : Nat :=
  let terms := upperTerms rule ownHi otherHi
  settle (basePoints rule terms.1 terms.2) bonusHi supportHi den

/-- Independent upper bounds on own score and the nonnegative other-player
    contribution suffice, including when room rounding gives room < own.
    This also applies within any bonus bin whose limits cover its completions. -/
theorem points_le_upper (rule : Rule) {own room ownHi otherHi bonus bonusHi
    support supportHi : Nat} (den : Nat) (hOwn : own ≤ ownHi)
    (hOther : room - own ≤ otherHi) (hBonus : bonus ≤ bonusHi)
    (hSupport : support ≤ supportHi) :
    points rule own room bonus support den ≤ upper rule ownHi otherHi bonusHi supportHi den := by
  apply settle_mono den _ hBonus hSupport
  apply basePoints_mono
  · cases rule <;> simp only [actualTerms, upperTerms] <;> omega
  · cases rule <;> simp only [actualTerms, upperTerms] <;> omega

/-- Both challenge-live formulas preserve a score maximizer when bonus and
    support are fixed. The production challenge-live mode supplies zero for both. -/
theorem challenge_mono (modern : Bool) {x y : Nat} (h : x ≤ y)
    (bonus support den : Nat) :
    let rule : Rule := if modern then .challengeModern else .challengeLegacy
    points rule x x bonus support den ≤ points rule y y bonus support den := by
  cases modern <;> apply settle_mono den _ (Nat.le_refl _) (Nat.le_refl _)
  · exact Nat.add_le_add_left (softCap_mono h _ _) 1000
  · exact Nat.add_le_add_left (floor_mono h) 3250

/-- Rank bonuses and win/loss bonuses are constants once the option is fixed.
    The formula uses the same score component at every rank for that event. -/
def rankedPoints (festival modern : Bool) (offset boost score : Nat) : Nat :=
  let component := if modern then score / (scale * 6500) else
    softCap 5500 (if festival then [2625000, 187500, 312500] else challengeWidths) score
  (component + offset) * boost

theorem rankedPoints_mono (festival modern : Bool) (offset boost : Nat)
    {x y : Nat} (h : x ≤ y) :
    rankedPoints festival modern offset boost x ≤ rankedPoints festival modern offset boost y := by
  apply Nat.mul_le_mul_right
  apply Nat.add_le_add_right
  cases modern with
  | false => exact softCap_mono h _ _
  | true => exact floor_mono h

/-- In version 0 even a solo live can have a nonzero second term above the
    own-score cap. Using the uncapped own score in the subtraction loses 5 Pt. -/
example : points (.normal0 50 10000) (2000000 * scale) (2000000 * scale) 0 0 1 = 205 := by
  decide

/-- A half-point in the expected song score is kept until the challenge formula
    runs. Moving the Pt floor inside the skill-order expectation changes it. -/
example :
    points .challengeModern (512 * 449999 + 512 * 450000) 0 0 0 1 = 4249 ∧
    points .challengeModern (450000 * scale) 0 0 0 1 = 4250 := by
  decide

end Bandori.Single.EventPoints
