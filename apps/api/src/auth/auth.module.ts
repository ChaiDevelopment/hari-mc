import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthLibraryVerifier, GoogleTokenVerifier } from './google-verifier';
import { EmailLoginService } from './email-login.service';
import { ConfiguredMailer, Mailer } from '../mail/mailer';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, EmailLoginService, { provide: GoogleTokenVerifier, useClass: GoogleAuthLibraryVerifier }, { provide: Mailer, useClass: ConfiguredMailer }],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
