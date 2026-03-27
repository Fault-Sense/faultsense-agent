import { createServerFn } from '@tanstack/react-start'

export const login = createServerFn({ method: 'POST' })
  .inputValidator((data: { username: string; password: string }) => data)
  .handler(async ({ data }) => {
    // Hardcoded demo credentials
    if (data.username === 'demo' && data.password === 'demo') {
      return { success: true }
    }
    return { error: 'Invalid username or password' }
  })
