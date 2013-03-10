if (typeof com == "undefined") {
    var com = {};
}

com.sppad = com.sppad || {};
com.sppad.fstbh = com.sppad.fstbh || {};

com.sppad.fstbh.Main = new function() {

    const MILLISECONDS_PER_SECOND = 1000;
    
    let self = this;
    
    self.tabCount = 0;
    self.evaluateTimer = null;
    
    this.handleEvent = function(aEvent) {
        switch (aEvent.type) {
            case com.sppad.fstbh.Preferences.EVENT_PREFERENCE_CHANGED:
                this.prefChanged(aEvent.name, aEvent.value);
                break;
            case 'TabClose':
                this.updateTabCount(true);
                break;
            case 'TabOpen':
                this.updateTabCount();
                break;
            default:
                break;
        }
    };

    this.prefChanged = function(name, value) {
        com.sppad.fstbh.Utils.dump("pref change: " + name + " -> " + value + "\n");

        switch (name) {
            case 'transitionDelay':
                this.setTransitionDelay(value);
                break;
            case 'transitionProperty':
                this.setTransitionProperty(value);
                com.sppad.fstbh.NavBoxHandler.setHiddenStyle();
                break;
            case 'style.browserBottomBox':
                this.applyAttribute('browser-bottombox', 'backgroundStyle', value);
                break;
            case 'style.topChromeBackground':
                this.applyAttribute('navigator-toolbox', 'backgroundStyle', value);
                break;
            case 'showIdentityBox':
                document.getElementById('com_sppad_fstbh_ssl_info_boundry').setAttribute('hidden', !value);
                break;
            case 'showTabsToolbar':
                this.setShowTabsToolbar(value);
                this.updateTabCount();
                break;
            case 'showPersonalToolbar':
                this.setShowPersonalToolbar(value);
                break;
            case 'normalMode':
                this.setNormalMode(value);
                break;
            case 'maximizedMode':
                this.setMaximizedMode(value);
                break;
            case 'fullishScreen':
                this.updateAppliedStatus();
                break;
            default:
                break;
        }
    };
    
    this.observe = function (aSubject, aTopic, aData) {
        if(aTopic == 'lightweight-theme-styling-update')
            self.applied && self.setupTheme();
        else if(aTopic == 'nsPref:changed' && aData == 'browser.fullscreen.autohide')
            self.updateAppliedStatus();
    };
    
    this.setupTheme = function() {
        let mainWindow = document.getElementById('main-window');
        let titlebar = document.getElementById('titlebar');
        
        gNavToolbox.style.color = mainWindow.style.backgroundImage;
        gNavToolbox.style.backgroundColor = mainWindow.style.backgroundColor;
        gNavToolbox.style.backgroundImage = mainWindow.style.backgroundImage;
        
        /*
         * For Windows - if applied while window mode is normal (not
         * maximized/fullscreen), titlebar will have part of the persona
         * already. Don't want to repeat the start of the persona, to shift it
         * up to align correctly.
         * 
         * For PersonalTitlebar - don't show window controls when not tabs in
         * title bar by setting separatedTitlebar attribute.
         */
        if(titlebar) {
            let marginBottom = titlebar.style.marginBottom;
            let separatedTitlebar = (marginBottom == '') 
                || (marginBottom && marginBottom.startsWith('0'))
                || (window.windowState === window.STATE_NORMAL);
            
            let topOffset = separatedTitlebar ? -gNavToolbox.boxObject.y : 0;
            gNavToolbox.style.backgroundPosition = '100% ' + topOffset + 'px';
            
            self.applyAttribute('main-window', 'separatedTitlebar', separatedTitlebar);
        }
    };
    
    this.clearTheme = function() {
        gNavToolbox.style.color = '';
        gNavToolbox.style.backgroundColor = '';
        gNavToolbox.style.backgroundImage = '';
    };
    
    /**
     * Applies an attribute to a DOM node, prefixed with com_sppad_fstbh_ to
     * avoid clashing with other addons.
     */
    this.applyAttribute = function(id, name, value) {
        document.getElementById(id).setAttribute("com_sppad_fstbh_" + name, value);
    };
    
    /**
     * Updates the applied status, checking if the add-on should be applied or
     * not. Sets everything up for auto-hide behavior to take effect.
     */
    this.updateAppliedStatus = function() {
        let cp = com.sppad.fstbh.CurrentPrefs;
        
        let sizemode = window.windowState;
        
        let normal = sizemode == window.STATE_NORMAL;
        let maximized = sizemode == window.STATE_MAXIMIZED;
        let fullscreen = sizemode == window.STATE_FULLSCREEN;

        let applyInNormal = cp['normalMode'] == 'hover';
        let applyInMaximized = cp['maximizedMode'] == 'hover';
        let applyInFullscreen = gPrefService.getBoolPref("browser.fullscreen.autohide") == true;
 
        self.applied = (normal && applyInNormal)
                    || (maximized && applyInMaximized)
                    || (fullscreen && applyInFullscreen);
        
        self.applyAttribute('main-window', 'applied', self.applied);
        
        self.windowingTweaks(maximized, applyInMaximized, fullscreen, applyInFullscreen);
    
        if(self.applied) {
            self.setupTheme();
            self.offsetBrowser();
            com.sppad.fstbh.NavBoxHandler.enable();
        } else {
            self.clearTheme();
            com.sppad.fstbh.NavBoxHandler.disable();
        }
        
        let showTabsContextItem = document.getElementById('com_sppad_fstbh_tcm_showTabsContextIem');
        if(self.applied)
            showTabsContextItem.removeAttribute('disabled');
        else
            showTabsContextItem.setAttribute('disabled', true);
    };
    
    /**
     * Performs tweaks, mostly for Windows.
     * <p>
     * Handles the fullishScreen preference, which sets the window inFullscreen
     * attribute to tell everyone that we are in fullscreen. They might still
     * use sizemode, but that really isn't our problem.
     * <p>
     * XXX - Wait until there is a way to fix the titlebar controls. Currently,
     * just add some buttons to take the same space as the ones Windows creates.
     * Would like to use the fullscreen controls from Firefox, but Windows
     * directly draws the buttons and we can't do anything with that space.
     * <p>
     * This originally came up for supporting the PersonalTitlebar add-on.
     */
    this.windowingTweaks = function(maximized, applyInMaximized, fullscreen, applyInFullscreen) {
        let cp = com.sppad.fstbh.CurrentPrefs;
        
        let mainWindow = document.getElementById('main-window');
        let tabViewDeck = document.getElementById('tab-view-deck');
    
        if(maximized && applyInMaximized && cp['fullishScreen']) {
            mainWindow.setAttribute('com_sppad_fstbh_fullishScreen', 'true');
 
            mainWindow.setAttribute('inFullscreen', 'true');
            gNavToolbox.setAttribute('inFullscreen', 'true');
            tabViewDeck.style.paddingTop = -(mainWindow.boxObject.screenY) + "px";
        } else {
            mainWindow.removeAttribute('com_sppad_fstbh_fullishScreen');   
            tabViewDeck.style.paddingTop = "";
            
            if(!fullscreen) {
                mainWindow.removeAttribute('inFullscreen');
                gNavToolbox.removeAttribute('inFullscreen');
                tabViewDeck.style.paddingTop = '';
            }
        }
    };
    
    /**
     * Updates based on the number of tabs open. Sets the attribute to keep tabs
     * toolbar showing.
     * 
     * @param offset
     *            If called while a tab is closing, do not count that tab.
     */
    this.updateTabCount = function(offset) {
        self.tabCount = gBrowser.tabContainer.itemCount + (offset ? -1 : 0);
        
        let pref = com.sppad.fstbh.CurrentPrefs['showTabsToolbar'];
        let show = (pref == 'always') || (pref == 'multipleTabs' && self.tabCount > 1);
        this.applyAttribute('main-window', 'showTabsToolbar', show);
        
        this.offsetBrowser();
    };
    
    this.setTransitionDelay = function(value) {
        let transitionDelay = (value / MILLISECONDS_PER_SECOND) + 's';
        
        gNavToolbox.style.transitionDelay = transitionDelay;
    };
    
    this.setTransitionProperty = function(value) {
        gNavToolbox.style.transitionProperty = value;
    };

    this.setShowTabsToolbar = function(value) {
        let contextItems = ['com_sppad_fstbh_tcm_showTabsContextIem', 'com_sppad_fstbh_fullscreenTabs'];
        contextItems.forEach(function(id) {
            if(value == 'always')
                document.getElementById(id).setAttribute('checked', 'true');
            else
                document.getElementById(id).removeAttribute('checked');
        });
        
        this.offsetBrowser();
    };
    
    this.setShowPersonalToolbar = function(value) {
        self.applyAttribute('navigator-toolbox', 'showPersonalToolbar', value);
        
        let menuitem = document.getElementById('com_sppad_fstbh_fullscreenPersonalToolbar');
        if(value == 'hover')
            menuitem.setAttribute('checked', 'true');
        else
            menuitem.removeAttribute('checked');
        
        // Force initialization of PersonalToolbar if it is hiding so that it
        // populated when toolbars are popped open.
        if(value == 'hover') {
            let toolbar = document.getElementById('PersonalToolbar');
            let hiding = toolbar.getAttribute('collapsed') == 'true';
            
            if(hiding) {
                setToolbarVisibility(toolbar, true);
                setToolbarVisibility(toolbar, false);
            }
        }
    };
    
    this.setNormalMode = function(value) {
        
        let menuitem = document.getElementById('com_sppad_fstbh_tcm_normalModeContextItem');
        if(value == 'hover')
            menuitem.setAttribute('checked', 'true');
        else
            menuitem.removeAttribute('checked');
        
        self.updateAppliedStatus();
        
    };

    this.setMaximizedMode = function(value) {
        
        let menuitem = document.getElementById('com_sppad_fstbh_tcm_maximizedModeContextItem');
        if(value == 'hover')
            menuitem.setAttribute('checked', 'true');
        else
            menuitem.removeAttribute('checked');
        
        self.updateAppliedStatus();
    };
    
    this.setFullscreenTabs = function(source) {
        let checked = source.hasAttribute('checked');
        com.sppad.fstbh.Preferences.setPreference('showTabsToolbar', checked ? 'always' : 'hoverOnly');
    };
    
    this.setFullscreenPersonalToolbar = function(source) {
        let checked = source.hasAttribute('checked');
        com.sppad.fstbh.Preferences.setPreference('showPersonalToolbar', checked ? 'hover' : 'never');
    };
    
    this.setNormalAutohide = function(source) {
        let checked = source.hasAttribute('checked');
        com.sppad.fstbh.Preferences.setPreference('normalMode', checked ? 'hover' : 'normal');
    };
    
    this.setMaximizedAutohide = function(source) {
        let checked = source.hasAttribute('checked');
        com.sppad.fstbh.Preferences.setPreference('maximizedMode', checked ? 'hover' : 'normal');
    };
    
    /**
     * Offsets / un-offsets the browser by setting a top margin. This is done so
     * that we can stay as display stack and always show TabsToolbar without
     * covering page content. This is used when the showTabsToolbar is set to
     * always or multipleTabs.
     */
    this.offsetBrowser = function() {
        let sslBox = document.getElementById('com_sppad_fstbh_ssl_info_boundry');
        let browser = document.getElementById('browser');
        let tabsToolbar = document.getElementById('TabsToolbar');
        
        let offset = tabsToolbar.boxObject.height;
        let mode = com.sppad.fstbh.CurrentPrefs['showTabsToolbar'];
        
        if(mode == "always" || (mode == "multipleTabs" && self.tabCount > 1)) {
            sslBox.style.marginTop = offset + "px";
            browser.style.marginTop = offset + "px";
        } else {
            sslBox.style.marginTop = "";
            browser.style.marginTop = "";
        }
    };
    
    this.loadPreferences = function() {
        let prefs = ['transitionDelay', 'transitionProperty',
                     'showWhenTitleChanged', 'style.browserBottomBox',
                     'style.topChromeBackground', 'showTabsToolbar',
                     'showPersonalToolbar', 'normalMode', 'maximizedMode',
                     'showIdentityBox' ];
        
        prefs.forEach(function(pref) {
            self.prefChanged(pref, com.sppad.fstbh.CurrentPrefs[pref]);
        });
    };
    
    this.setup = function() {
        com.sppad.fstbh.Preferences.addListener(this);
        
        let tabContainer = window.gBrowser.tabContainer;
        
        tabContainer.addEventListener("TabClose", this, false);
        tabContainer.addEventListener("TabOpen", this, false);
        
        gPrefService.addObserver("browser.fullscreen", this, false);
        
        Components.classes["@mozilla.org/observer-service;1"]
            .getService(Components.interfaces.nsIObserverService)
            .addObserver(this, "lightweight-theme-styling-update", false);
        
        this.loadPreferences();
        this.updateTabCount();
    };
    
    this.cleanup = function() {
        
        Components.classes["@mozilla.org/observer-service;1"]
            .getService(Components.interfaces.nsIObserverService)
            .removeObserver(this, "lightweight-theme-styling-update");

        let tabContainer = window.gBrowser.tabContainer;
        tabContainer.removeEventListener("TabClose", this);
        tabContainer.removeEventListener("TabOpen", this);
        
        gPrefService.removeObserver("browser.fullscreen", this);
        
        com.sppad.fstbh.Preferences.removeListener(this);
    };

};

com.sppad.fstbh.sizemodeTimer = null;

window.addEventListener("load", function() {
    com.sppad.fstbh.Main.setup();
}, false);

window.addEventListener("unload", function() {
    com.sppad.fstbh.Main.cleanup();
    com.sppad.fstbh.Preferences.cleanup();
}, false);

window.addEventListener("sizemodechange", function () {
    // Need to let browser apply all changes first so it can correctly calculate
    // the bottom margin on the titlebar under Windows
    window.clearTimeout(com.sppad.fstbh.sizemodeTimer);
    com.sppad.fstbh.sizemodeTimer = window.setTimeout(function() {
        com.sppad.fstbh.Main.updateAppliedStatus();
    }, 10);
}, false);
