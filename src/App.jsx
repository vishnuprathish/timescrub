import React, { useEffect } from 'react';
import useStore from './store/store.js';
import FileUpload from './ingestion/FileUpload.jsx';
import ParseConfigPanel from './ingestion/ParseConfigPanel.jsx';
import Workspace from './ui/Workspace.jsx';
import Toast from './ui/Toast.jsx';
import { consumeSharedOps } from './utils/shareUrl.js';

export default function App() {
  const parseStep = useStore((s) => s.ui.parseStep);

  useEffect(() => {
    const ops = consumeSharedOps();
    if (ops) {
      // Store pending shared ops — Workspace will show a banner to apply them
      useStore.setState((state) => ({ ...state, _pendingSharedOps: ops }));
    }
  }, []);

  return (
    <div className="app-root">
      {parseStep === 'upload' && <FileUpload />}
      {parseStep === 'config' && <ParseConfigPanel />}
      {parseStep === 'workspace' && <Workspace />}
      <Toast />
    </div>
  );
}
