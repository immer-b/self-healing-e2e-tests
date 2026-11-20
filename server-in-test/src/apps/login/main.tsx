import { createRoot } from 'react-dom/client';
import { LoginApp } from './LoginApp';
import { parseUiVersion } from '../shared/uiVersion';
import '../shared/base.css';
import './login.css';

createRoot(document.getElementById('root')!).render(<LoginApp version={parseUiVersion(location.search)} />);
