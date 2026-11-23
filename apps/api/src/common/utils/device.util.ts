import { UAParser } from 'ua-parser-js';

export function parseDeviceLabel(userAgent?: string): {
  deviceLabel: string;
  userAgentSummary: string;
} {
  if (!userAgent || typeof userAgent !== 'string') {
    return { deviceLabel: 'Unknown Device', userAgentSummary: 'Unknown' };
  }

  const parser = new UAParser(userAgent);
  const browser = parser.getBrowser();
  const os = parser.getOS();
  const device = parser.getDevice();

  const browserName = browser.name ? `${browser.name} ${browser.major || ''}`.trim() : 'Web Client';
  const osName = os.name ? `${os.name}` : 'Unknown OS';
  const deviceType = device.type ? ` (${device.type})` : '';

  const deviceLabel = `${browserName} on ${osName}${deviceType}`.trim();

  return {
    deviceLabel: deviceLabel.slice(0, 100),
    userAgentSummary: userAgent.slice(0, 255),
  };
}

export function maskIp(ip?: string): string {
  if (!ip || typeof ip !== 'string') {
    return '127.0.0.x';
  }

  // Handle IPv4-mapped IPv6 like ::ffff:192.168.1.1
  const cleanIp = ip.replace(/^::ffff:/, '');

  if (cleanIp.includes('.')) {
    const parts = cleanIp.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
    }
  }

  if (cleanIp.includes(':')) {
    const parts = cleanIp.split(':');
    return `${parts.slice(0, 3).join(':')}:xxxx`;
  }

  return cleanIp.slice(0, 45);
}
