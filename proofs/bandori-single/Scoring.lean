import Formations

/-! An order-level score for normalized single-song inputs. Times and durations
are ordered keys of finite nonnegative values. The two rounded time additions,
the rounded note base, and the signed post-floor skill increment are supplied
separately. No algebraic rearrangement of floating-point products is required. -/
namespace Bandori.Single.Scoring

structure Note where
  index : Nat
  time : Nat

structure Trigger where
  index : Nat
  time : Nat

structure Clock where
  finish : Nat → Nat → Nat   -- rounded start + skill duration
  ready : Nat → Nat          -- rounded end + 0.75 seconds

structure Song (Skill : Type) where
  notes : List Note           -- normalized chart order
  trigger : Nat → Trigger     -- only the six slots 0..5 are visited
  clock : Clock
  resolve : Nat → Nat → Skill -- selected leader, then actual actor identity
  encore : Nat → Nat          -- leader in solo; configured actor in cooperative play
  duration : Skill → Nat
  base : Nat → Note → Int     -- per-leader base after the first floor
  extra : Skill → Nat → Note → Int → Int
  -- extra receives a one-based covered-note ordinal and the already rounded base

def queueStart (clock : Clock) (trigger duration : Nat → Nat) : Nat → Nat
  | 0 => trigger 0
  | w + 1 => max (trigger (w+1)) (clock.ready (clock.finish (queueStart clock trigger duration w) (duration w)))

def skillAt (s : Song Skill) (leader : Nat) (order : List Nat) (slot : Nat) : Skill :=
  s.resolve leader (if slot < 5 then order[slot]?.getD 0 else s.encore leader)

structure Window (Skill : Type) where
  triggerIndex : Nat
  start : Nat
  stop : Nat
  skill : Skill

def windows (s : Song Skill) (leader : Nat) (order : List Nat) : List (Window Skill) :=
  let skills := skillAt s leader order
  let start := queueStart s.clock (fun w => (s.trigger w).time) (fun w => s.duration (skills w))
  (List.range 6).map fun w =>
    ⟨(s.trigger w).index, start w, s.clock.finish (start w) (s.duration (skills w)), skills w⟩

theorem six_windows (s : Song Skill) (leader : Nat) (order : List Nat) :
    (windows s leader order).length = 6 := by simp [windows]

def covered (w : Window Skill) (n : Note) : Bool :=
  decide (w.triggerIndex < n.index ∧ w.start ≤ n.time ∧ n.time ≤ w.stop)

theorem coverage_iff (w : Window Skill) (n : Note) :
    covered w n = true ↔ w.triggerIndex < n.index ∧ w.start ≤ n.time ∧ n.time ≤ w.stop := by
  simp [covered]

theorem trigger_excluded (w : Window Skill) (n : Note) (h : n.index ≤ w.triggerIndex) :
    covered w n = false := by simp [covered, Nat.not_lt.mpr h]

theorem start_included (w : Window Skill) (n : Note) (hi : w.triggerIndex < n.index)
    (h : n.time = w.start) (valid : w.start ≤ w.stop) : covered w n = true := by
  exact (coverage_iff _ _).mpr ⟨hi, by omega, by omega⟩

theorem end_included (w : Window Skill) (n : Note) (hi : w.triggerIndex < n.index)
    (h : n.time = w.stop) (valid : w.start ≤ w.stop) : covered w n = true := by
  exact (coverage_iff _ _).mpr ⟨hi, by omega, by omega⟩

/-- The row scorer advances the ordinal only on covered notes. Growth skills
and continued PERFECT skills can depend on this ordinal. -/
def windowExtra (s : Song Skill) (leader : Nat) (w : Window Skill) :
    Nat → List Note → Int
  | _, [] => 0
  | seen, n :: ns =>
    if covered w n then
      s.extra w.skill (seen+1) n (s.base leader n) + windowExtra s leader w (seen+1) ns
    else windowExtra s leader w seen ns

def windowScore (s : Song Skill) (leader : Nat) (ws : List (Window Skill)) : Int :=
  Formations.total (s.base leader) s.notes + Formations.total (fun w => windowExtra s leader w 0 s.notes) ws

def perOrderScore (s : Song Skill) (leader : Nat) (order : List Nat) : Int :=
  windowScore s leader (windows s leader order)

/-- An independent note-first specification. For each note it counts earlier
covered notes directly in the prefix, and then looks across all active windows. -/
def earlier (w : Window Skill) : List Note → Nat
  | [] => 0
  | n :: ns => if covered w n then earlier w ns + 1 else earlier w ns

def extraAt (s : Song Skill) (leader : Nat) (w : Window Skill) (past : List Note) (n : Note) : Int :=
  if covered w n then s.extra w.skill (earlier w past + 1) n (s.base leader n) else 0

def noteScore (s : Song Skill) (leader : Nat) (ws : List (Window Skill)) :
    List Note → List Note → Int
  | _, [] => 0
  | past, n :: ns =>
    (s.base leader n + Formations.total (fun w => extraAt s leader w past n) ws) +
      noteScore s leader ws (n :: past) ns

private theorem sum_zero (xs : List α) : Formations.total (fun _ => 0) xs = 0 := by
  induction xs <;> simp_all [Formations.total]

private theorem sum_add (f g : α → Int) (xs : List α) :
    Formations.total (fun x => f x + g x) xs = Formations.total f xs + Formations.total g xs := by
  induction xs with
  | nil => rfl
  | cons x xs ih => simp [Formations.total, ih, Int.add_assoc, Int.add_comm, Int.add_left_comm]

private theorem split_row (s : Song Skill) (l : Nat) (w : Window Skill) (past : List Note)
    (n : Note) (ns : List Note) :
    windowExtra s l w (earlier w past) (n :: ns) =
      extraAt s l w past n + windowExtra s l w (earlier w (n :: past)) ns := by
  cases h : covered w n <;> simp [windowExtra, earlier, extraAt, h]

theorem rows_equal_notes (s : Song Skill) (l : Nat) (ws : List (Window Skill))
    (past ns : List Note) :
    Formations.total (s.base l) ns +
      Formations.total (fun w => windowExtra s l w (earlier w past) ns) ws =
      noteScore s l ws past ns := by
  induction ns generalizing past with
  | nil => simp [windowExtra, Formations.total, noteScore, sum_zero]
  | cons n ns ih =>
    simp only [Formations.total, split_row, sum_add, noteScore]
    have ht := ih (n :: past)
    omega

theorem perOrderScore_eq_notes (s : Song Skill) (l : Nat) (order : List Nat) :
    perOrderScore s l order = noteScore s l (windows s l order) [] s.notes := by
  exact rows_equal_notes s l _ [] s.notes

theorem weighted_score_eq_path_notes (s : Song Skill) (leader : Nat) (seats : List Nat) :
    Formations.weighted (fun o => perOrderScore s leader (o.map (fun i => seats[i]?.getD 0)))
        Formations.distribution =
      Formations.total (fun o => noteScore s leader
        (windows s leader (o.map (fun i => seats[i]?.getD 0))) [] s.notes) (Formations.paths 5) := by
  simp only [perOrderScore_eq_notes, Formations.distribution, Formations.weighted_counts]

/-! Bounds only require the monotonicity of the particular rounded additions,
not a reinterpretation of rounded timestamps as real-number sums. -/
structure MonotoneClock (clock : Clock) : Prop where
  finish : ∀ a b d e, a ≤ b → d ≤ e → clock.finish a d ≤ clock.finish b e
  ready : ∀ a b, a ≤ b → clock.ready a ≤ clock.ready b

theorem start_after_trigger (clock : Clock) (trigger d : Nat → Nat) (w : Nat) :
    trigger w ≤ queueStart clock trigger d w := by
  cases w with
  | zero => exact Nat.le_refl _
  | succ w => exact Nat.le_max_left _ _

theorem start_le_latest (clock : Clock) (hm : MonotoneClock clock) (trigger d upper : Nat → Nat)
    (hd : ∀ i, d i ≤ upper i) (w : Nat) :
    queueStart clock trigger d w ≤ queueStart clock trigger upper w := by
  induction w with
  | zero => exact Nat.le_refl _
  | succ w ih =>
    apply Nat.max_le.mpr
    exact ⟨Nat.le_max_left _ _, Nat.le_trans (hm.ready _ _ (hm.finish _ _ _ _ ih (hd w))) (Nat.le_max_right _ _)⟩

theorem fixed_start (clock : Clock) (hm : MonotoneClock clock) (trigger d upper : Nat → Nat)
    (hd : ∀ i, d i ≤ upper i) (w : Nat) (h : queueStart clock trigger upper w = trigger w) :
    queueStart clock trigger d w = trigger w := by
  exact Nat.le_antisymm (h ▸ start_le_latest clock hm trigger d upper hd w) (start_after_trigger clock trigger d w)

theorem same_duration_prefix (clock : Clock) (trigger a b : Nat → Nat) (w : Nat)
    (h : ∀ i, i < w → a i = b i) :
    queueStart clock trigger a w = queueStart clock trigger b w := by
  induction w with
  | zero => rfl
  | succ w ih => rw [queueStart, queueStart, ih (fun i hi => h i (by omega)), h w (by omega)]

theorem encore_start (clock : Clock) (hm : MonotoneClock clock) (trigger d upper : Nat → Nat)
    (hd : ∀ i, d i ≤ upper i) (h5 : queueStart clock trigger upper 4 = trigger 4) :
    queueStart clock trigger d 5 = max (trigger 5) (clock.ready (clock.finish (trigger 4) (d 4))) := by
  change max _ (clock.ready (clock.finish (queueStart clock trigger d 4) _)) = _
  rw [fixed_start clock hm trigger d upper hd 4 h5]

/-- The envelope can include notes before the true delayed start. Its upper
contributions are nonnegative, so those additional notes cannot lower it. -/
theorem windowExtra_le_envelope (s : Song Skill) (leader : Nat) (w : Window Skill)
    (endHi : Nat) (hi : Note → Int) (he : w.stop ≤ endHi) (hz : ∀ n, 0 ≤ hi n)
    (hd : ∀ n k, s.extra w.skill (k+1) n (s.base leader n) ≤ hi n) (ns : List Note) (seen : Nat) :
    windowExtra s leader w seen ns ≤ Formations.total
      (fun n => if w.triggerIndex < n.index ∧ n.time ≤ endHi then hi n else 0) ns := by
  induction ns generalizing seen with
  | nil => exact Int.le_refl _
  | cons n ns ih =>
    by_cases hc : covered w n = true
    · obtain ⟨hidx, _, hend⟩ := (coverage_iff _ _).mp hc
      have hin : w.triggerIndex < n.index ∧ n.time ≤ endHi := ⟨hidx, by omega⟩
      simp only [windowExtra, hc, if_true, Formations.total, hin]
      exact Int.add_le_add (hd n seen) (ih (seen+1))
    · have hf : covered w n = false := Bool.eq_false_iff.mpr hc
      simp [windowExtra, hf, Formations.total]
      have ht := ih seen
      by_cases hin : w.triggerIndex < n.index ∧ n.time ≤ endHi
      · simp only [hin, if_true]
        have := hz n
        omega
      · simpa [hin] using ht

theorem stop_le_envelope (clock : Clock) (hm : MonotoneClock clock) (trigger d upper : Nat → Nat)
    (hd : ∀ i, d i ≤ upper i) (w : Nat) :
    clock.finish (queueStart clock trigger d w) (d w) ≤
      clock.finish (queueStart clock trigger upper w) (upper w) :=
  hm.finish _ _ _ _ (start_le_latest clock hm trigger d upper hd w) (hd w)

private theorem sum_mono (xs : List α) (a b : α → Int) (h : ∀ x ∈ xs, a x ≤ b x) :
    Formations.total a xs ≤ Formations.total b xs := by
  induction xs with
  | nil => exact Int.le_refl _
  | cons x xs ih =>
    exact Int.add_le_add (h x (by simp)) (ih (fun v hv => h v (List.mem_cons_of_mem _ hv)))

/-- A family of admissible note envelopes bounds the whole order. Each
envelope may use its original trigger index and an optimistic latest end. -/
theorem perOrderScore_le_envelopes (s : Song Skill) (l : Nat) (o : List Nat)
    (endHi : Window Skill → Nat) (hi : Window Skill → Note → Int)
    (hEnd : ∀ w ∈ windows s l o, w.stop ≤ endHi w)
    (hz : ∀ w ∈ windows s l o, ∀ n, 0 ≤ hi w n)
    (hDelta : ∀ w ∈ windows s l o, ∀ n k, s.extra w.skill (k+1) n (s.base l n) ≤ hi w n) :
    perOrderScore s l o ≤ Formations.total (s.base l) s.notes + Formations.total
      (fun w => Formations.total (fun n => if w.triggerIndex < n.index ∧ n.time ≤ endHi w
        then hi w n else 0) s.notes) (windows s l o) := by
  unfold perOrderScore windowScore
  exact Int.add_le_add_left
    (sum_mono _ _ _ (fun w hw => windowExtra_le_envelope s l w _ _ (hEnd w hw)
      (hz w hw) (hDelta w hw) _ _)) _

end Bandori.Single.Scoring
