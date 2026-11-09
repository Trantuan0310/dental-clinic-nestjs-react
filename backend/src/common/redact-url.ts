/** Bearer credentials in patient URLs must not enter HTTP logs or error envelopes. */
export const redactPatientLinkUrl = (url: string) =>
  url.replace(/(\/(?:public\/appointment-links|lich-hen)\/)[^\s/<>"'?#]+/g, '$1[redacted]');
