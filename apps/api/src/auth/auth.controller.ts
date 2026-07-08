import { Controller, Post, Body, UseGuards, Req, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('google')
  async googleAuth(@Body() body: { googleToken: string }) {
    // Verify Google token and get profile
    // const profile = await this.authService.verifyGoogleToken(body.googleToken);
    // const user = await this.authService.findOrCreateGoogleUser(profile);
    // const token = this.authService.generateToken(user);
    // return { token, user };
    return { message: 'Google auth - WIP' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getCurrentUser(@Req() req) {
    return req.user;
  }
}
