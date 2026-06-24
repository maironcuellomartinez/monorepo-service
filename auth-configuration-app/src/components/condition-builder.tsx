import { useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Input } from "./ui/input"
import { Button } from "./ui/button"
import { Plus, X, Code, Sliders } from "lucide-react"

// ── Facts predefinidos del sistema ────────────────────────────────────────────

const FACT_OPTIONS = [
    // Usuario
    { key: 'user.roles',       label: 'Roles del usuario',           fact: 'user',       path: '$.roles',                   hint: 'ej: admin, technician',    valueType: 'text',    ops: ['contains', 'doesNotContain'] },
    { key: 'user.email',       label: 'Email del usuario',           fact: 'user',       path: '$.email',                   hint: 'ej: user@empresa.com',     valueType: 'text',    ops: ['equal', 'notEqual', 'in', 'notIn'] },
    { key: 'user.dept',        label: 'Departamento (atributo)',     fact: 'user',       path: '$.attributes.department',   hint: 'ej: IT, Soporte',          valueType: 'text',    ops: ['equal', 'notEqual', 'in', 'notIn'] },
    { key: 'user.cornerId',    label: 'Corner asignado (atributo)', fact: 'user',       path: '$.attributes.cornerId',     hint: 'UUID del corner',          valueType: 'text',    ops: ['equal', 'notEqual', 'in', 'notIn'] },
    // Contexto del request
    { key: 'ctx.cornerId',     label: 'Corner del request',         fact: 'context',    path: '$.cornerId',                hint: 'UUID del corner',          valueType: 'text',    ops: ['equal', 'notEqual', 'in', 'notIn'] },
    { key: 'ctx.department',   label: 'Departamento del request',   fact: 'context',    path: '$.department',              hint: 'ej: IT, RRHH',             valueType: 'text',    ops: ['equal', 'notEqual', 'in', 'notIn'] },
    { key: 'ctx.hour',         label: 'Hora del request (0-23)',    fact: 'context',    path: '$.hour',                    hint: 'ej: 9',                    valueType: 'number',  ops: ['equal', 'lessThan', 'greaterThan', 'lessThanInclusive', 'greaterThanInclusive'] },
    { key: 'ctx.schedule',     label: 'Horario laboral (nombre)',   fact: 'context',    path: '$.schedule',                hint: 'ej: morning, afternoon',   valueType: 'text',    ops: ['equal', 'notEqual', 'in', 'notIn'] },
    // Aplicación
    { key: 'app.environment',  label: 'Entorno de la aplicación',   fact: 'application', path: '$.environment',            hint: '',                         valueType: 'env',     ops: ['equal', 'notEqual', 'in', 'notIn'] },
    // Membresía
    { key: 'mbr.type',         label: 'Tipo de membresía',          fact: 'membership', path: '$.type',                    hint: 'ej: standard, premium',    valueType: 'text',    ops: ['equal', 'notEqual', 'in', 'notIn'] },
    { key: 'mbr.isExpired',    label: 'Membresía expirada',         fact: 'membership', path: '$.isExpired',               hint: '',                         valueType: 'boolean', ops: ['equal'] },
    // Libre
    { key: 'custom',           label: '— Personalizado —',          fact: '',           path: '',                          hint: '',                         valueType: 'text',    ops: ['equal', 'notEqual', 'lessThan', 'greaterThan', 'lessThanInclusive', 'greaterThanInclusive', 'in', 'notIn', 'contains', 'doesNotContain'] },
] as const

type FactKey = typeof FACT_OPTIONS[number]['key']

const ALL_OPERATORS = [
    { key: 'equal',                label: 'igual a' },
    { key: 'notEqual',             label: 'distinto de' },
    { key: 'lessThan',             label: 'menor que' },
    { key: 'greaterThan',          label: 'mayor que' },
    { key: 'lessThanInclusive',    label: 'menor o igual a' },
    { key: 'greaterThanInclusive', label: 'mayor o igual a' },
    { key: 'in',                   label: 'está en lista' },
    { key: 'notIn',                label: 'no está en lista' },
    { key: 'contains',             label: 'contiene' },
    { key: 'doesNotContain',       label: 'no contiene' },
]

// ── Tipos internos ────────────────────────────────────────────────────────────

interface ConditionRow {
    id: string
    factKey: FactKey
    customFact: string
    customPath: string
    operator: string
    value: string
}

function makeId() {
    return Math.random().toString(36).slice(2, 9)
}

function defaultRow(): ConditionRow {
    return { id: makeId(), factKey: 'user.roles', customFact: '', customPath: '', operator: 'contains', value: '' }
}

// ── Generador de JSON ─────────────────────────────────────────────────────────

function buildConditionJson(logic: 'all' | 'any', rows: ConditionRow[]): string {
    if (rows.length === 0) return '{}'

    const conditions = rows.map(row => {
        const factDef = FACT_OPTIONS.find(f => f.key === row.factKey)
        const fact = row.factKey === 'custom' ? row.customFact : (factDef?.fact ?? row.factKey)
        const path = row.factKey === 'custom' ? (row.customPath || undefined) : (factDef?.path || undefined)

        let value: any = row.value
        if (['in', 'notIn'].includes(row.operator)) {
            value = row.value.split(',').map(v => v.trim()).filter(Boolean)
        } else if (factDef?.valueType === 'number' && row.value !== '' && !isNaN(Number(row.value))) {
            value = Number(row.value)
        } else if (factDef?.valueType === 'boolean') {
            value = row.value === 'true'
        }

        const cond: Record<string, any> = { fact, operator: row.operator, value }
        if (path) cond.path = path
        return cond
    })

    if (conditions.length === 1) return JSON.stringify(conditions[0], null, 2)
    return JSON.stringify({ [logic]: conditions }, null, 2)
}

// ── Componente ────────────────────────────────────────────────────────────────

interface ConditionBuilderProps {
    value: string
    onChange: (json: string) => void
}

export function ConditionBuilder({ value, onChange }: ConditionBuilderProps) {
    const [mode, setMode] = useState<'builder' | 'json'>('builder')
    const [logic, setLogic] = useState<'all' | 'any'>('all')
    const [rows, setRows] = useState<ConditionRow[]>([defaultRow()])

    const emitRows = (nextLogic: 'all' | 'any', nextRows: ConditionRow[]) => {
        onChange(buildConditionJson(nextLogic, nextRows))
    }

    const setLogicAndEmit = (v: 'all' | 'any') => {
        setLogic(v)
        emitRows(v, rows)
    }

    const setRowsAndEmit = (nextRows: ConditionRow[]) => {
        setRows(nextRows)
        emitRows(logic, nextRows)
    }

    const addRow = () => setRowsAndEmit([...rows, defaultRow()])

    const removeRow = (id: string) => setRowsAndEmit(rows.filter(r => r.id !== id))

    const updateRow = (id: string, field: keyof ConditionRow, val: string) => {
        setRowsAndEmit(rows.map(r => {
            if (r.id !== id) return r
            const updated = { ...r, [field]: val }
            if (field === 'factKey') {
                const factDef = FACT_OPTIONS.find(f => f.key === val)
                updated.operator = factDef?.ops[0] ?? 'equal'
                updated.value = ''
            }
            return updated
        }))
    }

    const previewJson = buildConditionJson(logic, rows)

    return (
        <div className="space-y-3">
            {/* Mode toggle */}
            <div className="flex gap-2">
                <Button type="button" size="sm" variant={mode === 'builder' ? 'default' : 'outline'}
                    onClick={() => setMode('builder')}>
                    <Sliders className="h-3 w-3 mr-1" /> Builder
                </Button>
                <Button type="button" size="sm" variant={mode === 'json' ? 'default' : 'outline'}
                    onClick={() => setMode('json')}>
                    <Code className="h-3 w-3 mr-1" /> JSON avanzado
                </Button>
            </div>

            {mode === 'builder' ? (
                <div className="space-y-3">
                    {/* Logic selector — solo si hay más de una condición */}
                    {rows.length > 1 && (
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">Se deben cumplir</span>
                            <Select value={logic} onValueChange={v => setLogicAndEmit(v as 'all' | 'any')}>
                                <SelectTrigger className="w-44 h-7 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">TODAS las condiciones</SelectItem>
                                    <SelectItem value="any">AL MENOS UNA condición</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Filas de condiciones */}
                    <div className="space-y-2">
                        {rows.map((row) => {
                            const factDef = FACT_OPTIONS.find(f => f.key === row.factKey)
                            const availableOps = ALL_OPERATORS.filter(o =>
                                (factDef?.ops as readonly string[])?.includes(o.key)
                            )
                            const isListOp  = ['in', 'notIn'].includes(row.operator)
                            const isBool    = factDef?.valueType === 'boolean'
                            const isEnv     = factDef?.valueType === 'env'
                            const isCustom  = row.factKey === 'custom'

                            return (
                                <div key={row.id} className="border rounded-md p-2 space-y-2 bg-muted/20">
                                    <div className="flex items-center gap-2">
                                        {/* Fact */}
                                        <Select value={row.factKey} onValueChange={v => updateRow(row.id, 'factKey', v as FactKey)}>
                                            <SelectTrigger className="flex-1 h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {FACT_OPTIONS.map(f => (
                                                    <SelectItem key={f.key} value={f.key} className="text-xs">
                                                        {f.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>

                                        {/* Operador */}
                                        <Select value={row.operator} onValueChange={v => updateRow(row.id, 'operator', v)}>
                                            <SelectTrigger className="w-40 h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {availableOps.map(o => (
                                                    <SelectItem key={o.key} value={o.key} className="text-xs">
                                                        {o.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>

                                        {/* Eliminar fila */}
                                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                                            onClick={() => removeRow(row.id)}>
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>

                                    {/* Campos extra para fact personalizado */}
                                    {isCustom && (
                                        <div className="grid grid-cols-2 gap-2">
                                            <Input className="h-7 text-xs font-mono"
                                                placeholder="fact  (ej: context)"
                                                value={row.customFact}
                                                onChange={e => updateRow(row.id, 'customFact', e.target.value)} />
                                            <Input className="h-7 text-xs font-mono"
                                                placeholder="path  (ej: $.miCampo)"
                                                value={row.customPath}
                                                onChange={e => updateRow(row.id, 'customPath', e.target.value)} />
                                        </div>
                                    )}

                                    {/* Valor */}
                                    {isBool ? (
                                        <Select value={row.value} onValueChange={v => updateRow(row.id, 'value', v)}>
                                            <SelectTrigger className="h-7 text-xs">
                                                <SelectValue placeholder="Seleccionar..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="true">true — expirada</SelectItem>
                                                <SelectItem value="false">false — vigente</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    ) : isEnv ? (
                                        <Select value={row.value} onValueChange={v => updateRow(row.id, 'value', v)}>
                                            <SelectTrigger className="h-7 text-xs">
                                                <SelectValue placeholder="Seleccionar entorno..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="development">development</SelectItem>
                                                <SelectItem value="staging">staging</SelectItem>
                                                <SelectItem value="production">production</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <Input
                                            className="h-7 text-xs"
                                            placeholder={isListOp
                                                ? `valores separados por coma — ${factDef?.hint || 'val1, val2'}`
                                                : (factDef?.hint || 'valor')}
                                            value={row.value}
                                            onChange={e => updateRow(row.id, 'value', e.target.value)}
                                        />
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    <Button type="button" variant="outline" size="sm" onClick={addRow}>
                        <Plus className="h-3 w-3 mr-1" /> Agregar condición
                    </Button>

                    {/* Preview JSON */}
                    <div>
                        <p className="text-xs text-muted-foreground mb-1">Vista previa JSON generado:</p>
                        <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-28 leading-relaxed">
                            {previewJson}
                        </pre>
                    </div>
                </div>
            ) : (
                <div className="space-y-1">
                    <textarea
                        className="w-full h-40 p-3 border rounded-md font-mono text-sm bg-background resize-y"
                        value={value}
                        onChange={e => onChange(e.target.value)}
                        placeholder={'{\n  "all": [\n    { "fact": "context", "operator": "equal", "value": "corner-id", "path": "$.cornerId" }\n  ]\n}'}
                    />
                    <p className="text-xs text-muted-foreground">
                        Formato: <code className="font-mono">{"{ \"all\": [...] }"}</code> para AND,{" "}
                        <code className="font-mono">{"{ \"any\": [...] }"}</code> para OR.
                    </p>
                </div>
            )}
        </div>
    )
}
