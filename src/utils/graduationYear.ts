// A plain number input with min="1900" is the actual cause of the reported
// bug: an empty number input's up/down arrows (and some browsers' spinner
// click behavior) jump straight to `min` on first use, so a student typing
// toward "2027" could land on 1900 and be stuck nudging a tiny spinner
// hundreds of steps. A bounded, keyboard-navigable <select> of real years
// removes that failure mode entirely -- there's no "empty" state to jump
// from, and arrow keys/type-ahead move between real graduation years only.
//
// The range is deliberately narrow (current year through +10) because that
// covers every real near-term graduation date a current student would pick.
// A saved value from outside that range (a legacy account, or someone who
// set this in a prior year) is appended rather than dropped, so an existing
// selection always keeps rendering correctly even if it's now in the past
// or further out than the default window.
export function graduationYearOptions(currentYear: number, existingValue?: number | null): number[] {
  const years = Array.from({ length: 11 }, (_, index) => currentYear + index)
  if (existingValue != null && !years.includes(existingValue)) {
    years.push(existingValue)
    years.sort((a, b) => a - b)
  }
  return years
}
