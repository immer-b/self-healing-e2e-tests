import { createRoot } from 'react-dom/client';
import { QueryApp } from './QueryApp';
import { parseUiVersion } from '../shared/uiVersion';
import '../shared/base.css';
import './query.css';

createRoot(document.getElementById('root')!).render(<QueryApp version={parseUiVersion(location.search)} />);
