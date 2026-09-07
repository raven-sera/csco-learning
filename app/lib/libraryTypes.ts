export type NotebookSection = 'slides' | 'text' | 'audio';
export type NotebookOpenOptions = {
  section?: NotebookSection;
  mode?: 'read' | 'edit';
  capture?: boolean;
  slideId?: string;
};
export const NOTEBOOK_OPEN_EVENT = 'csco:open-notebook';
export function requestNotebook(reportId: number, options: NotebookOpenOptions = {}) {
  window.dispatchEvent(new CustomEvent(NOTEBOOK_OPEN_EVENT, { detail: { reportId, options } }));
}
