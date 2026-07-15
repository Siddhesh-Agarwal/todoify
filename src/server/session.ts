import { createServerFn } from '@tanstack/react-start'
import { getCurrentSession } from './session.server'

export const getSession = createServerFn({ method: 'GET' }).handler(async () => {
  return getCurrentSession()
})
