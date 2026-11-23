import Std

/-!
The successful finite paths in exact_score::skill_multiplier and
upper_bound::skill_delta. The rank proofs allow signed intermediates in
active-fallback and multiplier-1. The power function is an input: its actual
evaluated results are enclosed without any assumption about libm accuracy,
the value at exponent zero, or monotonicity in the exponent.
-/
namespace Bandori.Single.SkillBounds

structure Ops (α : Type) where
  lit : Nat → α
  half : α
  perfectJudge : α
  greatJudge : α
  add : α → α → α
  sub : α → α → α
  mul : α → α → α
  div : α → α → α
  up : α → α

inductive Skill (α : Type) where
  | neutral
  | score (percent : α) (growing : Bool)
  | scoreOnPerfect (percent : α)
  | perfectOnly (percent : α)
  | greatOrWorseHalf (percent : α)
  | continuedPerfect (activePercent fallbackPercent : α)

private def percentMultiplier (r : Ops α) (percent : α) : α :=
  r.add (r.lit 1) (r.div percent (r.lit 100))

private def weighted [BEq α] (r : Ops α) (p judge perfect great : α) : α :=
  if perfect == great then perfect else
    r.div (r.add (r.mul (r.mul r.perfectJudge perfect) p)
      (r.mul (r.mul r.greatJudge great) (r.sub (r.lit 1) p))) judge

private def continued (r : Ops α) (activePercent fallbackPercent power : α) : α :=
  let active := percentMultiplier r activePercent
  let fallback := percentMultiplier r fallbackPercent
  r.add fallback (r.mul power (r.sub active fallback))

def multiplier [BEq α] (r : Ops α) (p judge : α) (powf : Nat → α) (count : Nat) :
    Skill α → α
  | .neutral => r.lit 1
  | .score raw growing =>
    let percent := if growing then r.add raw (r.mul (r.mul r.half (r.lit (min count 100))) p)
      else raw
    percentMultiplier r percent
  | .scoreOnPerfect raw => weighted r p judge (percentMultiplier r raw) (r.lit 1)
  | .perfectOnly raw => weighted r p judge (percentMultiplier r raw) (r.lit 0)
  | .greatOrWorseHalf raw => weighted r p judge (percentMultiplier r raw) r.half
  | .continuedPerfect active fallback => continued r active fallback (powf count)

/-- The Rust loop initializes both ends to one, then visits counts 1 through n. -/
def powerRange [Min α] [Max α] (one : α) (powf : Nat → α) : Nat → α × α
  | 0 => (one, one)
  | n+1 =>
    let bounds := powerRange one powf n
    (min bounds.1 (powf (n+1)), max bounds.2 (powf (n+1)))

theorem powerRange_covers (one : Int) (powf : Nat → Int) (count n : Nat)
    (h1 : 1 ≤ count) (hn : count ≤ n) :
    (powerRange one powf n).1 ≤ powf count ∧ powf count ≤ (powerRange one powf n).2 := by
  induction n with
  | zero => omega
  | succ n ih =>
    simp only [powerRange]
    by_cases he : count = n+1
    · subst count; omega
    · have := ih (by omega)
      omega

def upperMultiplier [BEq α] [Min α] [Max α] (r : Ops α) (p judge : α)
    (powf : Nat → α) (notes : Nat) (skill : Skill α) : α :=
  match skill with
  | .continuedPerfect on off =>
    let bounds := powerRange (r.lit 1) powf notes
    max (continued r on off bounds.1) (continued r on off bounds.2)
  | other => multiplier r p judge powf 100 other

/-- Rank zero represents zero. Only the growing-score and continued branches
    need arithmetic monotonicity; the conditional branches reuse the identical
    rounded expression. The division here has fixed positive divisor 100. -/
structure Ordered (r : Ops Int) : Prop where
  zero_lit : r.lit 0 = 0
  count_mono : ∀ {a b}, a ≤ b → r.lit a ≤ r.lit b
  half_nonneg : 0 ≤ r.half
  add_right : ∀ a {x y}, x ≤ y → r.add a x ≤ r.add a y
  div100 : ∀ {x y}, x ≤ y → r.div x (r.lit 100) ≤ r.div y (r.lit 100)
  mul_right : ∀ {a x y}, 0 ≤ a → x ≤ y → r.mul a x ≤ r.mul a y
  mul_left_pos : ∀ {a x y}, 0 ≤ a → x ≤ y → r.mul x a ≤ r.mul y a
  mul_left_neg : ∀ {a x y}, a ≤ 0 → x ≤ y → r.mul y a ≤ r.mul x a
  sub_left : ∀ a {x y}, x ≤ y → r.sub x a ≤ r.sub y a
  sub_self : ∀ a, r.sub a a = 0
  le_up : ∀ a, a ≤ r.up a

theorem multiplier_le_upper {r : Ops Int} (laws : Ordered r) (p judge : Int)
    (hp : 0 ≤ p) (powf : Nat → Int) (count notes : Nat)
    (h1 : 1 ≤ count) (hn : count ≤ notes) (skill : Skill Int) :
    multiplier r p judge powf count skill ≤ upperMultiplier r p judge powf notes skill := by
  cases skill with
  | neutral | scoreOnPerfect _ | perfectOnly _ | greatOrWorseHalf _ => exact Int.le_refl _
  | score raw growing =>
    cases growing with
    | false => exact Int.le_refl _
    | true =>
      apply laws.add_right
      apply laws.div100
      apply laws.add_right
      apply laws.mul_left_pos hp
      apply laws.mul_right laws.half_nonneg
      apply laws.count_mono
      omega
  | continuedPerfect on off =>
    let d := r.sub (percentMultiplier r on) (percentMultiplier r off)
    have ⟨lo, hi⟩ := powerRange_covers (r.lit 1) powf count notes h1 hn
    change continued r on off (powf count) ≤ max _ _
    by_cases positive : 0 ≤ d
    · exact Int.le_trans (laws.add_right _ (laws.mul_left_pos positive hi)) (Int.le_max_right ..)
    · exact Int.le_trans (laws.add_right _ (laws.mul_left_neg (show d ≤ 0 by omega) lo))
        (Int.le_max_left ..)

/-- Both directed rounding steps follow the production placement exactly. -/
def delta [LE α] [DecidableLE α] (r : Ops α) (maximum : α) : α :=
  if maximum ≤ r.lit 1 then r.lit 0 else r.up (r.sub (r.up maximum) (r.lit 1))

theorem signed_delta_le {r : Ops Int} (laws : Ordered r) {m maximum : Int}
    (h : m ≤ maximum) : max 0 (r.sub m (r.lit 1)) ≤ delta r maximum := by
  unfold delta
  split
  next hsmall =>
    rw [laws.zero_lit]
    have hs := laws.sub_left (r.lit 1) (Int.le_trans h hsmall)
    rw [laws.sub_self] at hs
    omega
  next hlarge =>
    have hStep := laws.le_up maximum
    have hpos := laws.sub_left (r.lit 1) (show r.lit 1 ≤ r.up maximum by omega)
    rw [laws.sub_self] at hpos
    have hsub := laws.sub_left (r.lit 1) (Int.le_trans h hStep)
    have hfinal := laws.le_up (r.sub (r.up maximum) (r.lit 1))
    omega

/-- Local interface for a finite u32 base and a successful floor_to_u32 call.
    value decodes a signed rank into units of a common positive denominator.
    The last two fields are the IEEE error bounds needed by Rust's two nextUp
    steps: one encloses its rounded product, the other its subtraction.
    They concern individual scalar operations, not a candidate or branch score. -/
structure NoteBridge (r : Ops Int) (value floorToInt : Int → Int)
    (unit : Int) (base : Nat) (baseRank maximum : Int) : Prop where
  unit_pos : 0 < unit
  decode_mono : ∀ {x y}, x ≤ y → value x ≤ value y
  decode_zero : value (r.lit 0) = 0
  base_nonneg : 0 ≤ baseRank
  decode_base : value baseRank = (base : Int) * unit
  unit_product : r.mul baseRank (r.lit 1) = baseRank
  floor_le : ∀ x, floorToInt x * unit ≤ value x
  product_step : r.lit 1 < maximum →
    value (r.mul baseRank maximum) ≤ (base : Int) * value (r.up maximum)
  subtraction_step : r.lit 1 < maximum →
    value (r.up maximum) - unit ≤ value (r.up (r.sub (r.up maximum) (r.lit 1)))

theorem note_extra_le {r : Ops Int} (laws : Ordered r) {value floorToInt : Int → Int}
    {unit : Int} {base : Nat} {baseRank m maximum : Int}
    (bridge : NoteBridge r value floorToInt unit base baseRank maximum) (h : m ≤ maximum) :
    (floorToInt (r.mul baseRank m) - (base : Int)) * unit ≤
      (base : Int) * value (delta r maximum) := by
  let scored := r.mul baseRank m
  have hFloor := bridge.floor_le scored
  have hb : (0 : Int) ≤ (base : Int) := by omega
  unfold delta
  split
  next hsmall =>
    have hbnd := bridge.decode_mono (laws.mul_right bridge.base_nonneg (Int.le_trans h hsmall))
    rw [bridge.unit_product, bridge.decode_base] at hbnd
    rw [bridge.decode_zero, Int.mul_zero, Int.sub_mul]
    change floorToInt scored * unit - (base : Int) * unit ≤ 0
    change value scored ≤ (base : Int) * unit at hbnd
    omega
  next hlarge =>
    have hs := bridge.decode_mono (laws.mul_right bridge.base_nonneg h)
    have hprod := bridge.product_step (by omega)
    have hsub := Int.mul_le_mul_of_nonneg_left (bridge.subtraction_step (by omega)) hb
    rw [Int.mul_sub] at hsub
    rw [Int.sub_mul]
    change floorToInt scored * unit - (base : Int) * unit ≤ _
    change value scored ≤ value (r.mul baseRank maximum) at hs
    omega

/-- Leaf-to-card interface: the bound on a successful note's signed increment
    follows from its skill case and the two local rounding enclosures. -/
theorem skill_note_extra_le {r : Ops Int} (laws : Ordered r) (p judge : Int)
    (hp : 0 ≤ p) (powf : Nat → Int) (count notes : Nat)
    (h1 : 1 ≤ count) (hn : count ≤ notes) (skill : Skill Int)
    {value floorToInt : Int → Int} {unit : Int} {base : Nat} {baseRank : Int}
    (bridge : NoteBridge r value floorToInt unit base baseRank
      (upperMultiplier r p judge powf notes skill)) :
    (floorToInt (r.mul baseRank (multiplier r p judge powf count skill)) - (base : Int)) * unit ≤
      (base : Int) * value (delta r (upperMultiplier r p judge powf notes skill)) :=
  note_extra_le laws bridge (multiplier_le_upper laws p judge hp powf count notes h1 hn skill)

/-- The rank proofs use the working kernel's supplied power results. This
    interpretation also lets fixed binary64 cases check the expression order. -/
def floatOps : Ops Float where
  lit n := n.toUInt64.toFloat
  half := 0.5
  perfectJudge := 1.1
  greatJudge := 0.8
  add := (· + ·)
  sub := (· - ·)
  mul := (· * ·)
  div := (· / ·)
  up x := Float.ofBits (if x == 0 then 1 else x.toBits + 1)

/- Exercise both continued-PERFECT signs, a capped count, and a negative
   increment. These concrete checks do not discharge the scalar IEEE laws. -/
#eval show IO Unit from do
  let powers (n : Nat) : Float := match n with
    | 1 => 0.5 | 2 => 0.25 | _ => 0.125
  let up := upperMultiplier floatOps 0.5 0.95 powers 3
  let atCount := multiplier floatOps 0.5 0.95 powers
  unless up (.continuedPerfect 100 0) == 2.0 &&
      up (.continuedPerfect 0 100) == 1.875 &&
      atCount 101 (.score 0 true) == 1.25 &&
      atCount 1 (.perfectOnly 0) < 1.0 &&
      delta floatOps (up (.perfectOnly 0)) == 0.0 do
    throw (IO.userError "rounded skill envelope regression")

end Bandori.Single.SkillBounds
