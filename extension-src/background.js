// Open the Sieve Builder in a content tab when the toolbar button is clicked,
// reusing the existing tab if it's still open. We remember the tab id rather
// than querying tab URLs, so no "tabs" permission is needed.
let builderTabId = null;

messenger.browserAction.onClicked.addListener(async () => {
  if (builderTabId !== null) {
    try {
      await messenger.tabs.update(builderTabId, { active: true });
      return;
    } catch {
      builderTabId = null; // the tab was closed
    }
  }
  const tab = await messenger.tabs.create({ url: messenger.runtime.getURL('index.html') });
  builderTabId = tab.id;
});
