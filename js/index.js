(function(global) {
    const DockingSystem = global.DockingSystem;
    
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = DockingSystem;
    } else {
        global.DockingSystem = DockingSystem;
    }
    
    global.createDockingSystem = function(containerId, options) {
        return new DockingSystem(containerId, options);
    };
    
})(typeof window !== 'undefined' ? window : this);