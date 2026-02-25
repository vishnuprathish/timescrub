import React from 'react';
import useStore from './store/store.js';
import FileUpload from './ingestion/FileUpload.jsx';
import ParseConfigPanel from './ingestion/ParseConfigPanel.jsx';
import Workspace from './ui/Workspace.jsx';
import Toast from './ui/Toast.jsx';

export default function App() {
  const parseStep = useStore((s) => s.ui.parseStep);

  return (
    <div className="app-root">
      {parseStep === 'upload' && <FileUpload />}
      {parseStep === 'config' && <ParseConfigPanel />}
      {parseStep === 'workspace' && <Workspace />}
      <Toast />
    </div>
  );
}
