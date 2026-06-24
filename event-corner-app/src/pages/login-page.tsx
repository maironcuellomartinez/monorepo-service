import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, LogIn } from 'lucide-react'
import { useAuth } from '@/context/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [oid, setOid] = useState('dev-user-001')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email.trim()) {
      setError('El email es obligatorio')
      return
    }
    if (!oid.trim()) {
      setError('El OID es obligatorio')
      return
    }

    setLoading(true)
    try {
      await login(email.trim(), oid.trim(), name.trim() || email.trim())
      navigate('/dashboard')
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Error al iniciar sesión'
      setError(msg)
      // Clean up the token we stored before the /me call failed
      sessionStorage.removeItem('ec_token')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center mb-4 shadow-lg">
            <Building2 className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Event Corner</h1>
          <p className="text-muted-foreground text-sm mt-1">Service Desk Platform</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Iniciar sesión</CardTitle>
            <CardDescription>
              Modo desarrollo — ingresa tus credenciales de prueba
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="empleado1@eventcorner.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="oid">
                  OID <span className="text-muted-foreground text-xs">(dev)</span>
                </Label>
                <Input
                  id="oid"
                  placeholder="dev-user-001"
                  value={oid}
                  onChange={(e) => setOid(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Identificador de usuario Azure AD (simulado en dev)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">
                  Nombre <span className="text-muted-foreground text-xs">(opcional)</span>
                </Label>
                <Input
                  id="name"
                  placeholder="Juan Pérez"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                <LogIn className="h-4 w-4" />
                {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Modo bypass Entra ID — solo para desarrollo local
        </p>
      </div>
    </div>
  )
}
