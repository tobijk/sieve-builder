// Open the Sieve Builder in a content tab when the toolbar button is clicked,
// reusing the existing tab if one is already open.
messenger.browserAction.onClicked.addListener(async () => {
  const url = messenger.runtime.getURL('index.html');
  const tabs = await messenger.tabs.query({});
  const existing = tabs.find((t) => t.url === url);
  if (existing) {
    await messenger.tabs.update(existing.id, { active: true });
  } else {
    await messenger.tabs.create({ url });
  }
});
