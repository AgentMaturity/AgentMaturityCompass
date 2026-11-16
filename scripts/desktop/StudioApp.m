#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

// The window shows the Compass Console that launch-studio.sh starts. The script prints KEY=value lines (see its header);
// this app loads only a loopback console URL, and sets the owner session cookie it was handed as a session-only cookie.
static NSString * const AMCAppName = @"Agent Maturity Compass Studio";
static NSString * const AMCWebDataDigestKey = @"AMCWebDataPackageDigest";
static NSString * const AMCQuitChoiceKey = @"AMCQuitChoice"; // 0 ask, 1 stop AMC, 2 keep it running

@interface AMCStudioDelegate : NSObject <NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate>
@property (strong) NSWindow *window;
@property (strong) WKWebView *webView;
@property (strong) NSView *overlay;
@property (strong) NSProgressIndicator *spinner;
@property (strong) NSTextField *statusLabel;
@property (strong) NSButton *retryButton;
@property (strong) NSButton *logsButton;
@property (strong) NSTask *launcherTask; // the launcher run that starts or switches Studio, while it runs
@property (strong) NSMenuItem *switchItem;
@property (copy) NSDictionary<NSString *, NSString *> *info;
@property (copy) NSString *mode;
@property (copy) NSString *studioURL;
@property (assign) BOOL busy;
@property (assign) BOOL setupDone;
@property (assign) BOOL startedStudio;
@property (assign) BOOL terminating;
@property (assign) BOOL terminateReplied;
@end

@implementation AMCStudioDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  [self buildMenu];
  [self buildWindow];
  [NSApp activateIgnoringOtherApps:YES];
  [self showProgress:@"Starting Agent Maturity Compass…"];
  NSMutableDictionary<NSString *, NSString *> *info = [NSMutableDictionary dictionary];
  [self runLauncher:@"info" onLine:^(NSString *key, NSString *value) { info[key] = value; } done:^(int status) {
    self.info = info;
    self.setupDone = [info[@"AMC_SETUP_DONE"] isEqualToString:@"1"];
    if (self.setupDone) [self start:@"workspace"];
    else [self showFirstRun];
  }];
}

// ---- Launcher -------------------------------------------------------------------------------------------------------

- (void)runLauncher:(NSString *)mode onLine:(void (^)(NSString *key, NSString *value))onLine done:(void (^)(int status))done {
  NSString *script = [[[NSBundle mainBundle] resourcePath] stringByAppendingPathComponent:@"launch-studio.sh"];
  NSMutableDictionary<NSString *, NSString *> *env = [[[NSProcessInfo processInfo] environment] mutableCopy];
  if ([[[NSBundle mainBundle] bundleIdentifier] hasSuffix:@".dev"] && env[@"AMC_STUDIO_SUPPORT_DIR"] == nil) {
    env[@"AMC_STUDIO_SUPPORT_DIR"] = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Application Support/Agent Maturity Compass Dev"];
  }
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @autoreleasepool {
      NSTask *task = [[NSTask alloc] init];
      NSPipe *pipe = [NSPipe pipe];
      task.executableURL = [NSURL fileURLWithPath:@"/bin/sh"];
      task.arguments = @[script, mode];
      task.environment = env;
      task.standardInput = [NSFileHandle fileHandleWithNullDevice];
      task.standardOutput = pipe;
      NSError *error = nil;
      BOOL starts = [mode isEqualToString:@"workspace"] || [mode isEqualToString:@"demo"];
      if (starts) self.launcherTask = task;
      if (![task launchAndReturnError:&error]) {
        dispatch_async(dispatch_get_main_queue(), ^{
          onLine(@"AMC_ERROR", [NSString stringWithFormat:@"Could not run the AMC launcher: %@", error.localizedDescription]);
          done(1);
        });
        return;
      }
      // Lines are read as they arrive, so progress shows while the script runs; reading to end of file first means a
      // full pipe can never stall the script.
      NSFileHandle *reader = pipe.fileHandleForReading;
      NSMutableData *buffer = [NSMutableData data];
      NSData *chunk;
      while ((chunk = [reader availableData]).length > 0) {
        [buffer appendData:chunk];
        [self drainLines:buffer into:onLine];
      }
      [task waitUntilExit];
      int status = task.terminationStatus;
      if (starts && self.launcherTask == task) self.launcherTask = nil;
      dispatch_async(dispatch_get_main_queue(), ^{ done(status); });
    }
  });
}

- (void)drainLines:(NSMutableData *)buffer into:(void (^)(NSString *key, NSString *value))onLine {
  NSData *newline = [NSData dataWithBytes:"\n" length:1];
  NSRange end;
  while ((end = [buffer rangeOfData:newline options:0 range:NSMakeRange(0, buffer.length)]).location != NSNotFound) {
    NSString *line = [[NSString alloc] initWithData:[buffer subdataWithRange:NSMakeRange(0, end.location)] encoding:NSUTF8StringEncoding] ?: @"";
    [buffer replaceBytesInRange:NSMakeRange(0, end.location + 1) withBytes:NULL length:0];
    NSRange equals = [line rangeOfString:@"="];
    if (![line hasPrefix:@"AMC_"] || equals.location == NSNotFound) continue;
    NSString *key = [line substringToIndex:equals.location];
    NSString *value = [line substringFromIndex:equals.location + 1];
    dispatch_async(dispatch_get_main_queue(), ^{ onLine(key, value); });
  }
}

// ---- Starting, switching and stopping --------------------------------------------------------------------------------

- (void)showFirstRun {
  [self showProgress:@"Welcome."];
  [self.spinner stopAnimation:nil];
  NSAlert *alert = [[NSAlert alloc] init];
  alert.messageText = @"Welcome to Agent Maturity Compass";
  alert.informativeText = [NSString stringWithFormat:@"AMC keeps its records on this Mac, in %@.\n\nSetting up creates your own workspace there, a signing vault whose passphrase AMC keeps in your macOS Keychain, and an owner account named %@ that this app signs in with for you.\n\nYou can look around a sample workspace first. The demo is view only.",
    [self workspaceDir], NSUserName()];
  [alert addButtonWithTitle:@"Set Up My Workspace"];
  [alert addButtonWithTitle:@"Try the Demo"];
  [alert addButtonWithTitle:@"Quit"];
  [alert beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse response) {
    if (response == NSAlertFirstButtonReturn) [self start:@"workspace"];
    else if (response == NSAlertSecondButtonReturn) [self start:@"demo"];
    else [NSApp terminate:nil];
  }];
}

- (void)start:(NSString *)mode {
  if (self.busy) return;
  self.busy = YES;
  self.mode = mode;
  self.studioURL = nil;
  [self showProgress:[mode isEqualToString:@"demo"] ? @"Starting the demo workspace…" : @"Starting AMC…"];
  NSMutableDictionary<NSString *, NSString *> *out = [NSMutableDictionary dictionary];
  [self runLauncher:mode onLine:^(NSString *key, NSString *value) {
    if ([key isEqualToString:@"AMC_STATUS"]) [self showProgress:value];
    else out[key] = value;
  } done:^(int status) {
    self.busy = NO;
    if ([out[@"AMC_STARTED"] isEqualToString:@"1"]) self.startedStudio = YES;
    NSURL *url = [self consoleURL:out[@"AMC_STUDIO_URL"]];
    if (status != 0 || url == nil) {
      [self showProblem:out[@"AMC_ERROR"] ?: [NSString stringWithFormat:@"AMC could not start. Details are in %@.", [self logPath]] action:@"Retry"];
      return;
    }
    if ([mode isEqualToString:@"workspace"]) self.setupDone = YES;
    self.studioURL = url.absoluteString;
    NSString *title = out[@"AMC_TITLE"];
    self.window.title = title.length > 0 ? [NSString stringWithFormat:@"%@ — %@", AMCAppName, title] : AMCAppName;
    self.switchItem.title = [mode isEqualToString:@"demo"] ? @"Open My Workspace" : @"Try the Demo";
    [self showProgress:@"Opening the Compass Console…"];
    [self clearStaleWebData:out[@"AMC_PACKAGE_DIGEST"] then:^{
      [self forgetSessionCookieThen:^{
        [self setSessionCookie:out[@"AMC_SESSION"] forURL:url then:^{
          [self.webView loadRequest:[NSURLRequest requestWithURL:url]];
          if (out[@"AMC_NOTICE"].length > 0) [self showNotice:out[@"AMC_NOTICE"]];
        }];
      }];
    }];
  }];
}

// Only the console on loopback, as the launcher prints it, is ever loaded.
- (NSURL *)consoleURL:(NSString *)text {
  NSPredicate *console = [NSPredicate predicateWithFormat:@"SELF MATCHES %@", @"http://127[.]0[.]0[.]1:[0-9]{1,5}/(w/demo/)?console/"];
  return text != nil && [console evaluateWithObject:text] ? [NSURL URLWithString:text] : nil;
}

- (void)retry:(id)sender {
  if (self.mode == nil && !self.setupDone) [self showFirstRun];
  else [self start:self.mode ?: @"workspace"];
}

- (void)switchWorkspace:(id)sender {
  if (self.busy) return;
  if ([self.mode isEqualToString:@"demo"] || self.mode == nil) {
    if (self.setupDone) [self start:@"workspace"];
    else [self showFirstRun];
  } else {
    [self start:@"demo"];
  }
}

- (void)stopStudio:(id)sender {
  if (self.busy) return;
  self.busy = YES;
  [self showProgress:@"Stopping AMC…"];
  [self runLauncher:@"stop" onLine:^(NSString *key, NSString *value) {} done:^(int status) {
    self.busy = NO;
    self.studioURL = nil;
    self.startedStudio = NO;
    [self.webView loadHTMLString:@"" baseURL:nil];
    [self forgetSessionCookieThen:^{}];
    [self showProblem:[NSString stringWithFormat:@"AMC is stopped. Your records stay in %@.", [self workspaceDir]] action:@"Start AMC"];
  }];
}

// ---- Web data ------------------------------------------------------------------------------------------------------

// A new AMC version: service workers and caches from the old one would serve old scripts under the new pages, so they go
// before the first load. Cookies and local storage stay.
- (void)clearStaleWebData:(NSString *)digest then:(void (^)(void))next {
  NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
  if (digest.length == 0 || [[defaults stringForKey:AMCWebDataDigestKey] isEqualToString:digest]) { next(); return; }
  NSSet<NSString *> *types = [NSSet setWithArray:@[WKWebsiteDataTypeServiceWorkerRegistrations, WKWebsiteDataTypeFetchCache,
    WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache, WKWebsiteDataTypeOfflineWebApplicationCache]];
  [self.webView.configuration.websiteDataStore removeDataOfTypes:types modifiedSince:[NSDate distantPast] completionHandler:^{
    [defaults setObject:digest forKey:AMCWebDataDigestKey];
    next();
  }];
}

// A session cookie (no expiry): WebKit keeps it in memory only, and the launcher signs in again at the next start.
- (void)setSessionCookie:(NSString *)session forURL:(NSURL *)url then:(void (^)(void))next {
  NSPredicate *token = [NSPredicate predicateWithFormat:@"SELF MATCHES %@", @"[A-Za-z0-9%._~-]{16,4096}"];
  NSHTTPCookie *cookie = session != nil && [token evaluateWithObject:session] ? [NSHTTPCookie cookieWithProperties:@{
    NSHTTPCookieName: @"amc_session", NSHTTPCookieValue: session, NSHTTPCookieDomain: url.host, NSHTTPCookiePath: @"/",
    @"HttpOnly": @"TRUE", NSHTTPCookieSameSitePolicy: NSHTTPCookieSameSiteStrict }] : nil;
  if (cookie == nil) { next(); return; }
  [self.webView.configuration.websiteDataStore.httpCookieStore setCookie:cookie completionHandler:next];
}

// ---- Navigation: the console stays in the window, every other site opens in the default browser -----------------------

// Cookies are not scoped to a port, so the owner session would go to any other program listening on this Mac's
// loopback. Only the exact origin the launcher printed is the console; another 127.0.0.1 port opens outside the app.
- (BOOL)isConsoleURL:(NSURL *)url {
  NSURL *studio = self.studioURL != nil ? [NSURL URLWithString:self.studioURL] : nil;
  return studio != nil && studio.port != nil && url.port != nil && [url.scheme isEqualToString:@"http"]
    && [url.host isEqualToString:@"127.0.0.1"] && [url.port isEqualToNumber:studio.port];
}

// The owner session leaves the window with the Studio it belongs to: on Stop AMC and before every start or switch.
- (void)forgetSessionCookieThen:(void (^)(void))next {
  WKHTTPCookieStore *store = self.webView.configuration.websiteDataStore.httpCookieStore;
  [store getAllCookies:^(NSArray<NSHTTPCookie *> *cookies) {
    dispatch_group_t group = dispatch_group_create();
    for (NSHTTPCookie *cookie in cookies) {
      if (![cookie.name isEqualToString:@"amc_session"]) continue;
      dispatch_group_enter(group);
      [store deleteCookie:cookie completionHandler:^{ dispatch_group_leave(group); }];
    }
    dispatch_group_notify(group, dispatch_get_main_queue(), next);
  }];
}

- (void)openOutside:(NSURL *)url {
  if ([@[@"http", @"https", @"mailto"] containsObject:url.scheme.lowercaseString ?: @""]) [[NSWorkspace sharedWorkspace] openURL:url];
}

- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
  NSURL *url = action.request.URL;
  NSString *scheme = url.scheme.lowercaseString ?: @"";
  if (!action.targetFrame.isMainFrame || [self isConsoleURL:url] || [@[@"about", @"blob", @"data"] containsObject:scheme]) {
    decisionHandler(WKNavigationActionPolicyAllow);
    return;
  }
  [self openOutside:url];
  decisionHandler(WKNavigationActionPolicyCancel);
}

- (WKWebView *)webView:(WKWebView *)webView createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration forNavigationAction:(WKNavigationAction *)action windowFeatures:(WKWindowFeatures *)features {
  if ([self isConsoleURL:action.request.URL]) [webView loadRequest:action.request];
  else [self openOutside:action.request.URL];
  return nil;
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
  if (self.studioURL != nil) self.overlay.hidden = YES;
}

- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
  [self consoleDidNotLoad:error];
}

- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
  [self consoleDidNotLoad:error];
}

- (void)consoleDidNotLoad:(NSError *)error {
  // A cancelled load (another one replaced it, or a link went to the browser) is not a failure.
  if (error.code == NSURLErrorCancelled || error.code == 102) return;
  [self showProblem:[NSString stringWithFormat:@"The Compass Console did not load: %@ Click Retry to start AMC again.", error.localizedDescription] action:@"Retry"];
}

// ---- Menu actions --------------------------------------------------------------------------------------------------

- (void)reload:(id)sender {
  if (self.studioURL == nil) [self retry:sender];
  else if (self.webView.URL != nil && [self isConsoleURL:self.webView.URL]) [self.webView reload];
  else [self.webView loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:self.studioURL]]];
}

- (void)openInBrowser:(id)sender {
  NSURL *url = self.webView.URL != nil && [self isConsoleURL:self.webView.URL] ? self.webView.URL : (self.studioURL ? [NSURL URLWithString:self.studioURL] : nil);
  if (url != nil) [[NSWorkspace sharedWorkspace] openURL:url];
  else [self tell:@"AMC is not running" detail:@"Start AMC first, then open the console in your browser."];
}

- (void)showLogs:(id)sender {
  NSString *log = [self logPath];
  if ([[NSFileManager defaultManager] fileExistsAtPath:log]) [[NSWorkspace sharedWorkspace] openURL:[NSURL fileURLWithPath:log]];
  else [self tell:@"No log yet" detail:[NSString stringWithFormat:@"The launcher writes its log to %@ once AMC starts.", log]];
}

- (void)showAbout:(id)sender {
  NSString *version = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleShortVersionString"] ?: @"unknown";
  NSString *user = self.info[@"AMC_CONSOLE_USER"].length > 0 ? self.info[@"AMC_CONSOLE_USER"] : @"not created yet";
  [self tell:[NSString stringWithFormat:@"%@ %@", AMCAppName, version] detail:[NSString stringWithFormat:
    @"Node.js: %@\nAMC runtime: %@\nYour workspace: %@\nLauncher log: %@\nConsole account: %@ (its password is in your Keychain as amc-console; you need it only to sign in from a browser)\n\nRendered with the macOS WebKit framework. No browser runtime is bundled.",
    self.info[@"AMC_NODE"] ?: @"not found", self.info[@"AMC_RUNTIME_DIR"] ?: @"unknown", [self workspaceDir], [self logPath], user]];
}

- (void)openHelp:(id)sender {
  [[NSWorkspace sharedWorkspace] openURL:[NSURL URLWithString:@"https://agentmaturity.co/docs/"]];
}

- (void)tell:(NSString *)message detail:(NSString *)detail {
  NSAlert *alert = [[NSAlert alloc] init];
  alert.messageText = message;
  alert.informativeText = detail;
  [alert runModal];
}

- (NSString *)logPath {
  return self.info[@"AMC_LOG_FILE"] ?: [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Logs/Agent Maturity Compass/studio-launcher.log"];
}

- (NSString *)workspaceDir {
  return self.info[@"AMC_WORKSPACE_DIR"] ?: [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Application Support/Agent Maturity Compass/workspace"];
}

// ---- Quitting: offer to stop Studio, and stop it by default when this app started it --------------------------------

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
  return YES;
}

- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender {
  if (self.terminating) return NSTerminateNow;
  NSTask *starting = self.launcherTask;
  if (starting != nil && starting.isRunning) {
    // Quitting during a start: on SIGTERM the launcher stops what it began (npm and its children, a Studio it was
    // starting) and exits; the app quits when it has, or after 60 seconds at most.
    self.terminating = YES;
    [self showProgress:@"Stopping what AMC was starting…"];
    [starting terminate];
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
      [starting waitUntilExit];
      dispatch_async(dispatch_get_main_queue(), ^{ [self replyTerminate]; });
    });
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 60 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{ [self replyTerminate]; });
    return NSTerminateLater;
  }
  if (self.studioURL == nil && !self.startedStudio) return NSTerminateNow;
  NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
  NSInteger choice = [defaults integerForKey:AMCQuitChoiceKey];
  if (choice == 0) {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"Stop AMC when you quit?";
    alert.informativeText = self.startedStudio
      ? @"This app started AMC. Stopping it closes the local console and frees its ports. Your records stay on this Mac."
      : @"AMC was already running when this app opened. Stopping it closes the local console. Your records stay on this Mac.";
    NSString *stop = @"Stop AMC and Quit", *keep = @"Keep It Running and Quit";
    [alert addButtonWithTitle:self.startedStudio ? stop : keep];
    [alert addButtonWithTitle:self.startedStudio ? keep : stop];
    [alert addButtonWithTitle:@"Cancel"];
    alert.showsSuppressionButton = YES;
    alert.suppressionButton.title = @"Do not ask again";
    NSModalResponse response = [alert runModal];
    if (response == NSAlertThirdButtonReturn) return NSTerminateCancel;
    BOOL stopChosen = (response == NSAlertFirstButtonReturn) == self.startedStudio;
    choice = stopChosen ? 1 : 2;
    if (alert.suppressionButton.state == NSControlStateValueOn) [defaults setInteger:choice forKey:AMCQuitChoiceKey];
  }
  if (choice == 2) return NSTerminateNow;
  self.terminating = YES;
  [self showProgress:@"Stopping AMC…"];
  [self runLauncher:@"stop" onLine:^(NSString *key, NSString *value) {} done:^(int status) {
    [self replyTerminate];
  }];
  return NSTerminateLater;
}

- (void)replyTerminate {
  if (self.terminateReplied) return;
  self.terminateReplied = YES;
  [NSApp replyToApplicationShouldTerminate:YES];
}

// ---- Window, progress and problems ----------------------------------------------------------------------------------

- (void)buildWindow {
  NSRect frame = NSMakeRect(0, 0, 1280, 820);
  self.window = [[NSWindow alloc] initWithContentRect:frame
                                            styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable)
                                              backing:NSBackingStoreBuffered
                                                defer:NO];
  [self.window setTitle:AMCAppName];
  [self.window setMinSize:NSMakeSize(980, 640)];
  [self.window center];

  WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
  configuration.preferences.javaScriptCanOpenWindowsAutomatically = YES;
  self.webView = [[WKWebView alloc] initWithFrame:[[self.window contentView] bounds] configuration:configuration];
  [self.webView setNavigationDelegate:self];
  [self.webView setUIDelegate:self];
  [self.webView setAutoresizingMask:(NSViewWidthSizable | NSViewHeightSizable)];

  [[self.window contentView] addSubview:self.webView];
  [[self.window contentView] addSubview:[self buildOverlay:[[self.window contentView] bounds]]];
  [self.window makeKeyAndOrderFront:nil];
}

- (NSView *)buildOverlay:(NSRect)bounds {
  self.overlay = [[NSView alloc] initWithFrame:bounds];
  self.overlay.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  self.overlay.wantsLayer = YES;
  self.overlay.layer.backgroundColor = [NSColor colorWithCalibratedWhite:0.04 alpha:1.0].CGColor;
  self.overlay.appearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];

  self.spinner = [[NSProgressIndicator alloc] init];
  self.spinner.style = NSProgressIndicatorStyleSpinning;
  self.statusLabel = [NSTextField wrappingLabelWithString:@""];
  self.statusLabel.alignment = NSTextAlignmentCenter;
  self.statusLabel.selectable = YES; // so a log path or command can be copied
  self.statusLabel.textColor = [NSColor colorWithCalibratedRed:0.29 green:0.94 blue:0.47 alpha:1.0];
  self.statusLabel.font = [NSFont systemFontOfSize:17 weight:NSFontWeightMedium];
  [self.statusLabel.widthAnchor constraintLessThanOrEqualToConstant:640].active = YES;
  self.retryButton = [NSButton buttonWithTitle:@"Retry" target:self action:@selector(retry:)];
  self.logsButton = [NSButton buttonWithTitle:@"Show Logs" target:self action:@selector(showLogs:)];
  // Quit stays visible while AMC starts, so a first launch that waits on the network is never a dead end.
  NSButton *quit = [NSButton buttonWithTitle:@"Quit" target:NSApp action:@selector(terminate:)];
  NSStackView *buttons = [NSStackView stackViewWithViews:@[self.retryButton, self.logsButton, quit]];
  NSStackView *stack = [NSStackView stackViewWithViews:@[self.spinner, self.statusLabel, buttons]];
  stack.orientation = NSUserInterfaceLayoutOrientationVertical;
  stack.spacing = 18;
  stack.translatesAutoresizingMaskIntoConstraints = NO;
  [self.overlay addSubview:stack];
  [NSLayoutConstraint activateConstraints:@[
    [stack.centerXAnchor constraintEqualToAnchor:self.overlay.centerXAnchor],
    [stack.centerYAnchor constraintEqualToAnchor:self.overlay.centerYAnchor]
  ]];
  return self.overlay;
}

- (void)showProgress:(NSString *)text {
  self.overlay.hidden = NO;
  self.spinner.hidden = NO;
  [self.spinner startAnimation:nil];
  self.statusLabel.stringValue = text;
  self.retryButton.hidden = YES;
  self.logsButton.hidden = YES;
}

// Something the launcher changed that the person should know about (AMC_NOTICE), shown over the console once.
- (void)showNotice:(NSString *)text {
  NSAlert *alert = [[NSAlert alloc] init];
  alert.messageText = @"AMC changed your console password";
  alert.informativeText = text;
  [alert addButtonWithTitle:@"OK"];
  [alert beginSheetModalForWindow:self.window completionHandler:nil];
}

- (void)showProblem:(NSString *)text action:(NSString *)actionTitle {
  self.overlay.hidden = NO;
  [self.spinner stopAnimation:nil];
  self.spinner.hidden = YES;
  self.statusLabel.stringValue = text;
  self.retryButton.title = actionTitle;
  self.retryButton.hidden = NO;
  self.logsButton.hidden = NO;
}

// ---- Menu bar ------------------------------------------------------------------------------------------------------

- (NSMenuItem *)addItem:(NSString *)title action:(SEL)action key:(NSString *)key to:(NSMenu *)menu {
  NSMenuItem *item = [menu addItemWithTitle:title action:action keyEquivalent:key];
  item.target = self;
  return item;
}

// AppKit routes Cmd+Q, Cmd+R and the editing shortcuts through main-menu key equivalents.
- (void)buildMenu {
  NSMenu *mainMenu = [[NSMenu alloc] init];
  NSMenu *appMenu = [[NSMenu alloc] init];
  [self addItem:[@"About " stringByAppendingString:AMCAppName] action:@selector(showAbout:) key:@"" to:appMenu];
  [appMenu addItem:[NSMenuItem separatorItem]];
  [appMenu addItemWithTitle:[@"Quit " stringByAppendingString:AMCAppName] action:@selector(terminate:) keyEquivalent:@"q"];
  [[mainMenu addItemWithTitle:@"" action:nil keyEquivalent:@""] setSubmenu:appMenu];
  NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Edit"];
  [editMenu addItemWithTitle:@"Undo" action:@selector(undo:) keyEquivalent:@"z"];
  [editMenu addItemWithTitle:@"Redo" action:@selector(redo:) keyEquivalent:@"Z"];
  [editMenu addItemWithTitle:@"Cut" action:@selector(cut:) keyEquivalent:@"x"];
  [editMenu addItemWithTitle:@"Copy" action:@selector(copy:) keyEquivalent:@"c"];
  [editMenu addItemWithTitle:@"Paste" action:@selector(paste:) keyEquivalent:@"v"];
  [editMenu addItemWithTitle:@"Select All" action:@selector(selectAll:) keyEquivalent:@"a"];
  [[mainMenu addItemWithTitle:@"Edit" action:nil keyEquivalent:@""] setSubmenu:editMenu];
  NSMenu *studioMenu = [[NSMenu alloc] initWithTitle:@"Studio"];
  [self addItem:@"Reload" action:@selector(reload:) key:@"r" to:studioMenu];
  [self addItem:@"Open in Browser" action:@selector(openInBrowser:) key:@"o" to:studioMenu];
  self.switchItem = [self addItem:@"Try the Demo" action:@selector(switchWorkspace:) key:@"" to:studioMenu];
  [studioMenu addItem:[NSMenuItem separatorItem]];
  [self addItem:@"Stop AMC" action:@selector(stopStudio:) key:@"" to:studioMenu];
  [self addItem:@"Show Logs" action:@selector(showLogs:) key:@"" to:studioMenu];
  [studioMenu addItem:[NSMenuItem separatorItem]];
  [studioMenu addItemWithTitle:@"Close Window" action:@selector(performClose:) keyEquivalent:@"w"];
  [[mainMenu addItemWithTitle:@"Studio" action:nil keyEquivalent:@""] setSubmenu:studioMenu];
  NSMenu *windowMenu = [[NSMenu alloc] initWithTitle:@"Window"];
  [windowMenu addItemWithTitle:@"Minimize" action:@selector(performMiniaturize:) keyEquivalent:@"m"];
  [windowMenu addItemWithTitle:@"Zoom" action:@selector(performZoom:) keyEquivalent:@""];
  [windowMenu addItem:[NSMenuItem separatorItem]];
  [windowMenu addItemWithTitle:@"Bring All to Front" action:@selector(arrangeInFront:) keyEquivalent:@""];
  [[mainMenu addItemWithTitle:@"Window" action:nil keyEquivalent:@""] setSubmenu:windowMenu];
  NSMenu *helpMenu = [[NSMenu alloc] initWithTitle:@"Help"];
  [self addItem:[AMCAppName stringByAppendingString:@" Help"] action:@selector(openHelp:) key:@"?" to:helpMenu];
  [self addItem:@"Show Logs" action:@selector(showLogs:) key:@"" to:helpMenu];
  [[mainMenu addItemWithTitle:@"Help" action:nil keyEquivalent:@""] setSubmenu:helpMenu];
  [NSApp setMainMenu:mainMenu];
  [NSApp setWindowsMenu:windowMenu];
  [NSApp setHelpMenu:helpMenu];
}

@end

int main(int argc, const char * argv[]) {
  @autoreleasepool {
    NSApplication *application = [NSApplication sharedApplication];
    [application setActivationPolicy:NSApplicationActivationPolicyRegular];
    AMCStudioDelegate *delegate = [[AMCStudioDelegate alloc] init];
    [application setDelegate:delegate];
    [application run];
  }
  return 0;
}
