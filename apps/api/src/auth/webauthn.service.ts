import { Injectable } from '@nestjs/common';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';

@Injectable()
export class WebAuthnService {
  async generateRegistrationOptions(options: Parameters<typeof generateRegistrationOptions>[0]) {
    return generateRegistrationOptions(options);
  }

  async verifyRegistrationResponse(options: Parameters<typeof verifyRegistrationResponse>[0]) {
    return verifyRegistrationResponse(options);
  }

  async generateAuthenticationOptions(
    options: Parameters<typeof generateAuthenticationOptions>[0],
  ) {
    return generateAuthenticationOptions(options);
  }

  async verifyAuthenticationResponse(options: Parameters<typeof verifyAuthenticationResponse>[0]) {
    return verifyAuthenticationResponse(options);
  }
}
