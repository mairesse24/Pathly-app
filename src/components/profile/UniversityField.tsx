type UniversityFieldProps = {
  value: string
  onChange: (value: string) => void
  required?: boolean
}
import { searchUniversitySuggestions } from "../../services/universities"
export function UniversityField({
  value,
  onChange,
  required,
}: UniversityFieldProps) {
  return (
    <label>
      University
      <input
        list="pathly-university-suggestions"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Enter your university"
        autoComplete="organization"
        required={required}
      />
      <datalist id="pathly-university-suggestions">
        {searchUniversitySuggestions(value).map((name) => <option value={name} key={name} />)}
      </datalist>
      <small>Search suggestions or enter your university manually.</small>
    </label>
  )
}
