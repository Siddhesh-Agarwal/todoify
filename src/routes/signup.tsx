import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { signupSchema, type SignupInput } from '@/lib/schemas/auth'
import { authClient } from '@/lib/auth/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/signup')({
  component: SignupPage,
})

function SignupPage() {
  const navigate = useNavigate()
  const form = useForm<SignupInput>({ resolver: zodResolver(signupSchema), defaultValues: { name: '', email: '', password: '', confirm: '' } })

  const mutation = useMutation({
    mutationFn: async (input: SignupInput) =>
      authClient.signUp.email({ name: input.name, email: input.email, password: input.password }),
  })

  async function onSubmit(input: SignupInput) {
    const { error } = await mutation.mutateAsync(input)
    if (error) { form.setError('email', { message: error.message ?? 'Sign up failed' }); return }
    await navigate({ to: '/login' })
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle>Create your Todoify account</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...form.register('name')} />
              {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" {...form.register('email')} />
              {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" {...form.register('password')} />
              {form.formState.errors.password && <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input id="confirm" type="password" {...form.register('confirm')} />
              {form.formState.errors.confirm && <p className="text-sm text-destructive">{form.formState.errors.confirm.message}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={mutation.isPending}>Sign up</Button>
            <p className="text-sm text-muted-foreground">Already have an account? <Link to="/login" className="underline">Log in</Link></p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
