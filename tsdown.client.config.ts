import { clientBundle } from '../deepseek-harness/packages/client/tsdown.client.ts'

/**
 * Client bundle for the settings card: the harness' shared preset wraps the
 * browser artifact in the module-loader factory, inlines CSS Modules, and
 * keeps platform modules external. Requires the sibling harness checkout;
 * git installs ship the prebuilt `lib/client.js` instead.
 */
export default clientBundle('dsh-thinking-level-override', ['lib/types/index.js'])
