import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../interfaces/jwt-payload.interface.js';
import { UsersService } from '../../users/users.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        @Inject(ConfigService) configService: ConfigService,
        @Inject(UsersService) private usersService: UsersService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>('JWT_SECRET') || 'secretKey', // Fallback for dev
        });
    }

    async validate(payload: JwtPayload) {
        const user = await this.usersService.findById(payload.sub);
        if (!user) {
            throw new UnauthorizedException();
        }
        if (user.isBanned) {
            throw new UnauthorizedException('Account is suspended');
        }
        // Strip sensitive fields — req.user is returned directly from profile endpoint
        const { password, resetToken, resetTokenExpiry, ...safeUser } = user as any;
        return safeUser;
    }
}
