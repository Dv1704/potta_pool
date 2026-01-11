import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../interfaces/jwt-payload.interface.js';
import { UsersService } from '../../users/users.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        configService: ConfigService,
        private usersService: UsersService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>('JWT_SECRET') || 'secretKey', // Fallback for dev
        });
    }

    async validate(payload: JwtPayload) {
        console.log('JwtStrategy validating payload:', payload);
        const user = await this.usersService.findById(payload.sub);
        if (!user) {
            console.log('JwtStrategy: User not found for id:', payload.sub);
            throw new UnauthorizedException();
        }
        if (user.isBanned) {
            throw new UnauthorizedException('Account is suspended');
        }
        return user;
    }
}
