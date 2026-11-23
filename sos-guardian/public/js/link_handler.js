// link_handler.js – Enables launching the SOS Guardian PWA via URL parameters
// Example usage: https://yourdomain.com/?emergency=crime
// Supported values: crime, medical, fire

(() => {
  const params = new URLSearchParams(window.location.search);
  const emergency = params.get('emergency');
  if (!emergency) return;

  const map = {
    crime: window.EMERGENCY_TYPES.CRIME,
    medical: window.EMERGENCY_TYPES.MEDICAL,
    fire: window.EMERGENCY_TYPES.FIRE,
  };

  const typeObj = map[emergency.toLowerCase()];
  if (!typeObj) return;

  // Directly initiate the emergency flow without user tap
  // This is useful when the app is opened from a QR code or website link
  setTimeout(() => {
    // Show a brief confirmation overlay before dispatching (optional)
    if (window.alertService) {
      window.alertService.startCountdown({
        emergencyType: typeObj,
        seconds: 0, // immediate dispatch; could use a config value
        onTick: () => {},
        onCancelled: () => {
          console.log('Emergency cancelled via link UI');
        },
        onConfirmed: () => {
          window.alertService.executeAlertSequence({
            emergencyType: typeObj,
            onActionUpdate: (report) => {
              console.log('PWA link emergency dispatched', report);
            },
          });
        },
      });
    }
  }, 500);
})();
