import path from 'node:path'

const defaultProfilePath = '.e2e/linkedin-real-profile'

export const resolveRealLinkedInProfilePath = () => {
  return path.resolve(
    process.cwd(),
    process.env.LINKEDIN_REAL_PROFILE_DIR ?? defaultProfilePath,
  )
}
