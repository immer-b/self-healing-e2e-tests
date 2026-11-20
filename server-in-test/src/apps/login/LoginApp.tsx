import type { UiVersion } from '../shared/uiVersion';
import type { LayoutRegistry } from '../shared/versioning';
import { useLogin } from './useLogin';
import { ClassicLogin } from './layouts/ClassicLogin';
import { CardLogin } from './layouts/CardLogin';
import { SplitLogin } from './layouts/SplitLogin';
import type { LoginLayoutProps } from './layouts/types';

const LAYOUTS: LayoutRegistry<LoginLayoutProps> = { 1: ClassicLogin, 2: CardLogin, 3: SplitLogin };

export function LoginApp({ version }: { version: UiVersion }) {
  const { state, submit } = useLogin();
  const Layout = LAYOUTS[version];
  return <Layout state={state} onSubmit={submit} resultsHref="/query/" />;
}
