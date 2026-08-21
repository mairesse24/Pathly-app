import { graduationYearOptions } from "../../utils/graduationYear"

type GraduationYearFieldProps = {
  value: number | null
  onChange: (value: number | null) => void
  required?: boolean
}

export function GraduationYearField({ value, onChange, required }: GraduationYearFieldProps) {
  const years = graduationYearOptions(new Date().getFullYear(), value)
  return (
    <label>
      Expected graduation year
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
        required={required}
      >
        <option value="" disabled>Select a year</option>
        {years.map((year) => <option value={year} key={year}>{year}</option>)}
      </select>
    </label>
  )
}
