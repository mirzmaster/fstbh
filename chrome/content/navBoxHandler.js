if (typeof com == "undefined") {
    var com = {};
}

com.sppad = com.sppad || {};
com.sppad.fstbh = com.sppad.fstbh || {};

/**
 * Handles showing #navigator-toolbox due to mouse, focus or other events when
 * the add-on is applied.
 * 
 * This handles:
 * <ul>
 * <li>Showing when hovering
 * <li>Showing when going above the top of the browser
 * <li>Showing when one of the show events triggers
 * <li>Showing / staying open when there is a titlechange
 * <li>Showing / staying open when a menu is open
 * <li>Showing on input field (such as nav-bar or search bar) focus
 * <li>Showing when the menu bar is activated via keyboard
 * </ul>
 * 
 * This also handles:
 * <ul>
 * <li>Letting the identity box know when to update the site information.
 * </ul>
 */
com.sppad.fstbh.NavBoxHandler = new function() {
    
    const MILLISECONDS_PER_SECOND = 1000;
    const TAB_EVENTS = ['TabSelect', 'TabClose', 'TabOpen', 'TabPinned', 'TabUnpinned', 'TabAttrModified'];
    
    const FLAGS_CLOSED =                     0x00;
    const HOVERING_MASK =                    0x01;
    const FOCUSED_MASK =                     0x02;
    const MENU_ACTIVE_MASK =                 0x04;
    const POPUP_ACTIVE_MASK =                0x08;
    const TITLECHANGED_MASK =                0x10;
    const SHOW_EVENT_ACTIVE_MASK =           0x20;
    
    let self = this;
    self.opened = false;
    self.enabled = false;

    self.popupTarget = null;
    self.showingFlags = 0;
    
    self.showEventDelayTimer = null;
    self.eventTime = 0;
    
    /** How long to ignore a tab select for after a open or close */
    self.ignoreSelectDelta = 100;
    
    this.enable = function() {
        if(self.enabled)
            return;
        
        let toggler = document.getElementById('com_sppad_fstbh_top_toggler');
        let menubar = document.getElementById('toolbar-menubar');
        let mainWindow = document.getElementById('main-window');
        
        // Used for hiding when focused and escape is used
        document.addEventListener("keypress", self.keyevent, false);
        
        // Tracking mouse going out the top
        gBrowser.addEventListener('mouseleave', self.mouseenter, false);
        mainWindow.addEventListener('mouseleave', self.mouseenter, false);
        
        // For showing when mousing or dragging
        toggler.addEventListener('dragenter', self.mouseenter, false);
        toggler.addEventListener('mouseenter', self.mouseenter, false);
        gNavToolbox.addEventListener('dragenter', self.mouseenter, false);
        gNavToolbox.addEventListener('mouseenter', self.mouseenter, false);
        
        // For showing on input field focus
        gNavToolbox.addEventListener('focus', self.checkfocus, true);
        gNavToolbox.addEventListener('blur', self.checkfocus, true);
        
        // For staying showing when a menu is open
        gNavToolbox.addEventListener('popupshown', self.popupshown, false);
        gNavToolbox.addEventListener('popuphidden', self.popuphidden, false);
        
        window.addEventListener("DOMMenuBarActive", self.menuActive, false);
        window.addEventListener("DOMMenuBarInactive", self.menuInactive, false);
        
        // For show event and titlechange preferences
        TAB_EVENTS.forEach(function(eventName) {
            gBrowser.tabContainer.addEventListener(eventName, self, false);
        });
        
        // For URL change show event and updating SSL identity box
        gBrowser.addProgressListener(self);
        
        self.showingFlags = 0;
        self.setHiddenStyle();
        
        self.evalutateTitleChangeState();
        self.enabled = true;
    };
    
    this.disable = function() {
        if(!self.enabled)
            return;
        
        let toggler = document.getElementById('com_sppad_fstbh_top_toggler');
        let mainWindow = document.getElementById('main-window');
        
        // Used for hiding when focused and escape is used
        document.removeEventListener("keypress", self.keyevent);
        
        // Tracking mouse going out the top
        gBrowser.removeEventListener('mouseleave', self.mouseenter);
        mainWindow.removeEventListener('mouseleave', self.mouseenter);
        
        // For showing when mousing or dragging
        toggler.removeEventListener('dragenter', self.mouseenter);
        toggler.removeEventListener('mouseenter', self.mouseenter);
        gNavToolbox.removeEventListener('dragenter', self.mouseenter);
        gNavToolbox.removeEventListener('mouseenter', self.mouseenter);
        
        // For showing on input field focus
        gNavToolbox.removeEventListener('focus', self.checkfocus);
        gNavToolbox.removeEventListener('blur', self.checkfocus);
        
        // For staying showing when a menu is open
        gNavToolbox.removeEventListener('popupshown', self.popupshown);
        gNavToolbox.removeEventListener('popuphidden', self.popuphidden);
        
        window.removeEventListener("DOMMenuBarActive", self.menuActive);
        window.removeEventListener("DOMMenuBarInactive", self.menuInactive);
        
        // For show event and titlechange preferences
        TAB_EVENTS.forEach(function(eventName) {
            gBrowser.tabContainer.removeEventListener(eventName, self);
        });
        
        // For URL change show event and updating SSL identity box
        gBrowser.removeProgressListener(self);
        
        self.setShowingStyle();
        
        self.enabled = false;
    };
    
    this.handleEvent = function(aEvent) {
        let type = aEvent.type;
        let cp = com.sppad.fstbh.CurrentPrefs;
        let now = Date.now();
        let trigger = false;
        
        switch(aEvent.type) {
            case 'TabOpen':
                trigger = cp['showEvents.showOnTabOpen'];
                self.eventTime = now;
                break;
            case 'TabClose':
                trigger = cp['showEvents.showOnTabClose'];
                self.eventTime = now;
                break;
            case 'TabSelect':
                let allowSelect = (now - self.eventTime) > self.ignoreSelectDelta;
                trigger = allowSelect && cp['showEvents.showOnTabSelect'];
                break;
        }
        
        self.evalutateTitleChangeState();
        
        if(trigger)
            self.triggerShowEvent();
    };
    
    // nsIWebProgressListener
    this.QueryInterface = XPCOMUtils.generateQI(['nsIWebProgressListener', 'nsISupportsWeakReference']),
                        
    this.onLocationChange = function(aProgress, aRequest, aURI) {
        if(com.sppad.fstbh.CurrentPrefs['showEvents.showOnLocationChange'])
            self.triggerShowEvent();
    };

    // Nothing to do for these
    this.onStateChange = function() {};
    this.onProgressChange = function() {};
    this.onStatusChange = function() {};
    
    this.onSecurityChange = function(aWebProgress, aRequest, aState) {
        com.sppad.fstbh.Identity.updateState(aState);
    };
    
    // end nsIWebProgressListener
    
    this.menuActive = function(event) {
        self.showingFlags |= MENU_ACTIVE_MASK;
        self.updateOpenedStatus();
    };
    
    this.menuInactive = function(event) {
        self.showingFlags &= ~MENU_ACTIVE_MASK;
        self.updateOpenedStatus();
    };
    
    /**
     * Counts the number of tabs with a title change event. Used for showing the
     * navigator toolbox when there is a title change that hasn't been cleared.
     */
    this.evalutateTitleChangeState = function() {
        let pref = com.sppad.fstbh.CurrentPrefs['showWhenTitleChanged'];
        if(pref == "never")
            return;
        
        window.clearTimeout(self.evaluateTimer);
        
        // Delay to allow attributes to be set and limit update frequency
        self.evaluateTimer = window.setTimeout(function() {
            let tabContainer = gBrowser.tabContainer;
            let count = 0;
            
            for(let i = 0; i < tabContainer.itemCount; i++) {
                let tab = tabContainer.getItemAtIndex(i);
                let pinned = tab.hasAttribute('pinned');
                let titlechanged = tab.hasAttribute('titlechanged');
                
                if(titlechanged && (pref === 'any' || (pref === 'pinned' && pinned)))
                    count++;
            }
            
            if(count > 0)
                self.showingFlags |= TITLECHANGED_MASK;
            else
                self.showingFlags &= ~TITLECHANGED_MASK;
            
            self.updateOpenedStatus();
        }, 200);
    };
    
    /**
     * Causes the toolbars to show to due to a show event briefly before hiding
     * again.
     */
    this.triggerShowEvent = function() {
        self.showingFlags |= SHOW_EVENT_ACTIVE_MASK;
        self.updateOpenedStatus();

        window.clearTimeout(self.showEventDelayTimer);
        self.showEventDelayTimer = window.setTimeout(function() {
            self.showingFlags &= ~SHOW_EVENT_ACTIVE_MASK;
            self.updateOpenedStatus();
        }, com.sppad.fstbh.CurrentPrefs['showEvents.delay']);
    };
    
    /**
     * Handle escape: clear the focused item, if something is focused, so that
     * the toolbars can hide.
     */
    this.keyevent = function(aEvent) {
        if((self.showingFlags & FOCUSED_MASK) && (aEvent.keyCode == aEvent.DOM_VK_ESCAPE))
            document.commandDispatcher.focusedElement = null;
    };
    
    this.checkfocus = function(aEvent) {
        let fe = document.commandDispatcher.focusedElement;
        if(fe && fe.ownerDocument == document && fe.localName == "input")
            self.showingFlags |= FOCUSED_MASK;
        else
            self.showingFlags &= ~FOCUSED_MASK;
        
        self.updateOpenedStatus();
    };
        
    this.popupshown = function(aEvent) {
        let targetName = aEvent.target.localName;
        if(targetName == "tooltip" || targetName == "window")
            return;
        
        // Sub-popup, ignore it since original is still open
        if(self.popupTarget)
            return;
        
        self.showingFlags |= POPUP_ACTIVE_MASK;
        self.popupTarget = aEvent.originalTarget;
        self.updateOpenedStatus();
    };
    
    this.popuphidden = function(aEvent) {
        let targetName = aEvent.target.localName;
        if(targetName == "tooltip" || targetName == "window")
            return;
        
        // Check if sub-popup is closing and ignore it if it is
        if(self.popupTarget != aEvent.originalTarget)
            return;
        
        self.showingFlags &= ~POPUP_ACTIVE_MASK;
        self.popupTarget = null;
        self.updateOpenedStatus();
    };
    
    /**
     * Handles mouse entering either the toggler or navigator-toolbox and mouse
     * leaving the browser / main-window.
     * <p>
     * Mouse leave events covers two cases: task bar at the top of the screen
     * and Windows. For the task bar, if the mouse leaves the screen too
     * quickly, a mouseenter event might not be generated on the toggler or
     * navigator-toolbox. For Windows, empty parts of the navigator-toolbox do
     * not generate mouse events so mouseenter won't work when always showing
     * tabs. In that case, we need to rely on the mouse leaving the browser
     * instead.
     * <p>
     * Checks if the y location of the mouse to see if it is above the bottom of
     * toggler or navigator-toolbox. This is because a mouseenter event might
     * trigger when entering a popup. For example, if showing when the bookmarks
     * menu has been triggered via keyboard. If mousing over the menu, a
     * mouseenter event is generated. If the menu is closed, then hovering would
     * be still true if we did not check the y coordinate.
     * <p>
     * Can't simply check if the target is a popup, since the user can move from
     * the popup up into the navigator-toolbox without any additional events
     * generated.
     */
    this.mouseenter = function(aEvent) {
        if(self.showingFlags & HOVERING_MASK)
            return;

        let toggler = document.getElementById('com_sppad_fstbh_top_toggler');
        
        let navBottom = gNavToolbox.boxObject.screenY + gNavToolbox.boxObject.height; 
        let togglerBottom = toggler.boxObject.screenY + toggler.boxObject.height; 
        
        let y = aEvent.screenY;
        let togglerOnly = com.sppad.fstbh.CurrentPrefs['tweaks.mouseEnterOnTogglerOnly'];
        let tripPoint = togglerOnly ? togglerBottom : Math.max(navBottom, togglerBottom);
        
        if(y <= tripPoint) {
            self.showingFlags |= HOVERING_MASK;
            self.updateOpenedStatus();
        }
    };
 
    /**
     * Checks the to see if the mouse has gone below the bottom of the toolbars
     * and remove hovering if so.
     */
    this.checkMousePosition = function(aEvent) {
        if(!(self.showingFlags & HOVERING_MASK))
            return;
        
        let toggler = document.getElementById('com_sppad_fstbh_top_toggler');
        
        let navBottom = gNavToolbox.boxObject.screenY + gNavToolbox.boxObject.height; 
        let togglerBottom = toggler.boxObject.screenY + toggler.boxObject.height; 
        
        let y = aEvent.screenY;
        let buffer = com.sppad.fstbh.CurrentPrefs['bottomBuffer'];
        let tripPoint = Math.max(navBottom, togglerBottom) + buffer;
        
        if(y > tripPoint) {
            self.showingFlags &= ~HOVERING_MASK;
            self.updateOpenedStatus();
        }
    };

    this.updateOpenedStatus = function() {
        if(self.showingFlags != FLAGS_CLOSED)
            self.setOpened();
        else
            self.setClosed();
    }
    
    /**
     * Causes the navigator toolbox to show by setting the toggle attribute.
     * Also sets up listeners to stay open when menus are open and mouse move
     * for eventually closing.
     */
    this.setOpened = function() {
        if(self.opened)
            return;
        
        self.opened = true;
        
        window.addEventListener('dragover', self.checkMousePosition, false);
        window.addEventListener('mousemove', self.checkMousePosition, false);
        document.addEventListener('popupshown', self.popupshown, false);
        document.addEventListener('popuphidden', self.popuphidden, false);
        
        let transitionDuration = (com.sppad.fstbh.CurrentPrefs['transitionDurationIn'] / MILLISECONDS_PER_SECOND) + 's';
        gNavToolbox.style.transitionDuration = transitionDuration;
        
        self.setShowingStyle();
    };
    
    /**
     * Causes the navigator toolbox to close by removing the toggle attribute.
     * 
     * Also re-calculates the top offset in case the size of gNavToolbox has
     * changed.
     */
    this.setClosed = function() {
        if(!self.opened || !self.enabled)
            return;
        
        self.opened = false;
        
        window.removeEventListener('dragover', self.checkMousePosition);
        window.removeEventListener('mousemove', self.checkMousePosition);
        document.removeEventListener('popupshown', self.popupshown);
        document.removeEventListener('popuphidden', self.popuphidden);
        
        let transitionDuration = (com.sppad.fstbh.CurrentPrefs['transitionDurationOut'] / MILLISECONDS_PER_SECOND) + 's';
        gNavToolbox.style.transitionDuration = transitionDuration;
        
        self.setHiddenStyle();
    };
    
    /**
     * For height, transition is from auto to 0, so transition properties don't
     * have an effect. Don't use visibility or display since we still want to be
     * able to use shortcut keys for navigation/search boxes.
     */
    this.setHiddenStyle = function() {
        let mainWindow = document.getElementById('main-window');
        mainWindow.removeAttributeNS(com.sppad.fstbh.ns, 'toggle_top');
        
        // Slide-out doesn't work while in normal mode
        let transitionProperty = window.windowState == window.STATE_NORMAL
            ? 'height'
            : com.sppad.fstbh.CurrentPrefs['transitionProperty'];
        
        gNavToolbox.style.transitionProperty = transitionProperty;
        
        switch(transitionProperty) {
            case 'margin-top':
                gNavToolbox.style.height = '';
                gNavToolbox.style.marginTop = -(gNavToolbox.getBoundingClientRect().height) + "px";
                break;
            case 'height':
            default:
                gNavToolbox.style.height = '0';
                gNavToolbox.style.marginTop = '';
                break;
        }
    };
    
    this.setShowingStyle = function() {
        let mainWindow = document.getElementById('main-window');
        mainWindow.setAttributeNS(com.sppad.fstbh.ns, 'toggle_top', 'true');
            
        gNavToolbox.style.marginTop = '';
        gNavToolbox.style.height = '';
    };
};
