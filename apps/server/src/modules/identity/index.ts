// Public surface of the identity module. Other modules and app.ts import only from here.
export {
  createAuthPolicy,
  createSessionUserResolver,
  getMe,
  memberByEmail,
  memberNames,
  memberProfiles,
  type MemberProfile,
  seedMember,
  type IdentityDeps,
  type Me,
  type MemberSeed,
} from './service';
