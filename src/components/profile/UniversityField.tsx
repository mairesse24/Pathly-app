type UniversityFieldProps = {
  value: string
  onChange: (value: string) => void
  required?: boolean
}
export function UniversityField({
  value,
  onChange,
  required,
}: UniversityFieldProps) {
  return (
    <label>
      University
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Enter your university"
        autoComplete="organization"
        required={required}
      />
    </label>
  )
}
