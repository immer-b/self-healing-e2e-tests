import { createRoot } from 'react-dom/client';
import { ReportApp } from './ReportApp';
import { parseUiVersion } from '../shared/uiVersion';
import '../shared/base.css';
import './report.css';

createRoot(document.getElementById('root')!).render(<ReportApp version={parseUiVersion(location.search)} />);
