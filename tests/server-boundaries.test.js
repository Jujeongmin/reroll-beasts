import { afterEach, expect, it, vi } from 'vitest'
import { Server } from '../server/src/server.ts'

afterEach(() => vi.unstubAllGlobals())

it('rejects invalid matchmaking modes before touching storage', async () => {
  const server = new Server()
  expect(await server.joinQueue('invalid')).toMatchObject({ status: 'error' })
  expect(await server.pollQueue('invalid')).toMatchObject({ status: 'error' })
  expect(await server.leaveQueue('invalid')).toEqual({ ok: false })
})

it('does not let an outsider join a known match', async () => {
  const joinRoom = vi.fn()
  vi.stubGlobal('$sender', { account: 'outsider' })
  vi.stubGlobal('$global', {
    getCollectionItems: async () => [{ roomId: 'private', accounts: ['participant'] }],
    joinRoom,
  })
  expect(await new Server().joinMatchRoom('private')).toBeNull()
  expect(joinRoom).not.toHaveBeenCalled()
})

it('keeps the ninth caller waiting when the first eight are matched', async () => {
  const queued = Array.from({ length: 9 }, (_, i) => ({ account: `p${i}`, __id: `${i}`, at: i }))
  vi.stubGlobal('$sender', { account: 'p8' })
  vi.stubGlobal('$lock', async (_, work) => work())
  const updateUserState = vi.fn()
  vi.stubGlobal('$global', {
    getCollectionItems: async () => queued,
    addCollectionItem: vi.fn(), deleteCollectionItem: vi.fn(),
    updateUserState, sendMessageToUser: vi.fn(),
  })
  expect(await new Server().pollQueue('normal')).toMatchObject({ status: 'waiting', queued: 1 })
  expect(updateUserState).toHaveBeenCalledTimes(8)
  expect(updateUserState.mock.calls.some(c => c[0] === 'p8')).toBe(false)
})
