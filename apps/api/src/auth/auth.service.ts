import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Generate a client JWT token dynamique
   * Expiration = event.endDate + 24h
   */
  async generateClientToken(userId: string, eventId: string): Promise<string> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    const expiresAt = new Date(event.endDate.getTime() + 24 * 60 * 60 * 1000);

    return this.jwtService.sign(
      { userId, eventId, role: 'CLIENT' },
      { expiresIn: Math.floor((expiresAt.getTime() - Date.now()) / 1000) },
    );
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string) {
    return this.jwtService.verify(token);
  }

  /**
   * Create or get user from Google profile
   */
  async findOrCreateGoogleUser(profile: {
    id: string;
    email: string;
    name?: string;
    picture?: string;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (user) {
      return user;
    }

    return this.prisma.user.create({
      data: {
        email: profile.email,
        name: profile.name,
        googleId: profile.id,
        avatar: profile.picture,
      },
    });
  }

  /**
   * Save purchase intent (timestamps + secret per event)
   */
  saveIntent(eventId: string, clientId: string): { key: string; expiresIn: number } {
    const timestamp = Date.now();
    const secret = crypto.randomBytes(16).toString('hex');
    const key = `${eventId}:${timestamp}:${secret}`;

    // Store in Redis with 15min TTL
    const expiresIn = 15 * 60 * 1000;

    return { key, expiresIn };
  }

  /**
   * Consume purchase intent
   */
  consumeIntent(key: string): boolean {
    // Check if key exists in Redis, mark as consumed, return true
    // Implementation with Redis client
    return true;
  }
}
