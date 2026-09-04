using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using SomNet.API.Configuration;
using SomNet.API.Data;
using SomNet.API.Data.Entities;
using SomNet.Shared.DTO.Auth;

namespace SomNet.API.Services;

public sealed class AuthService : IAuthService
{
    private readonly SomNetDbContext _db;
    private readonly JwtSettings _jwtSettings;
    private readonly PasswordHasher<User> _passwordHasher = new();

    public AuthService(SomNetDbContext db, IOptions<JwtSettings> jwtSettings)
    {
        _db = db;
        _jwtSettings = jwtSettings.Value;
    }

    public LoginResponseDto? Login(LoginRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
        {
            return null;
        }

        var username = request.Username.Trim();
        var user = _db.Users.AsNoTracking().SingleOrDefault(entry => entry.Username == username);

        if (user is null)
        {
            return null;
        }

        var verification = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);

        if (verification is PasswordVerificationResult.Failed)
        {
            return null;
        }

        return CreateLoginResponse(user);
    }

    public UserDto? GetUser(string username)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return null;
        }

        var user = _db.Users.AsNoTracking().SingleOrDefault(entry => entry.Username == username.Trim());
        return user is null ? null : ToDto(user);
    }

    public (LoginResponseDto? Response, string? Error, bool IsConflict) Register(RegisterRequestDto request)
    {
        var usernameError = AuthValidation.ValidateUsername(request.Username);
        if (usernameError is not null)
        {
            return (null, usernameError, false);
        }

        var passwordError = AuthValidation.ValidatePassword(request.Password);
        if (passwordError is not null)
        {
            return (null, passwordError, false);
        }

        var username = AuthValidation.NormalizeUsername(request.Username);
        var displayName = AuthValidation.NormalizeDisplayName(request.DisplayName, username);

        if (_db.Users.Any(entry => entry.Username == username))
        {
            return (null, "That username is already taken.", true);
        }

        var user = new User
        {
            Username = username,
            DisplayName = displayName,
            PasswordHash = string.Empty,
        };

        user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);

        _db.Users.Add(user);
        _db.SaveChanges();

        return (CreateLoginResponse(user), null, false);
    }

    public (ChangePasswordResponseDto? Response, string? Error, bool IsUnauthorized) ChangePassword(
        string username,
        ChangePasswordRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return (null, "User is not authenticated.", true);
        }

        if (string.IsNullOrWhiteSpace(request.CurrentPassword))
        {
            return (null, "Current password is required.", false);
        }

        var newPasswordError = AuthValidation.ValidatePassword(request.NewPassword);
        if (newPasswordError is not null)
        {
            return (null, newPasswordError, false);
        }

        if (request.CurrentPassword == request.NewPassword)
        {
            return (null, "New password must be different from the current password.", false);
        }

        var user = _db.Users.SingleOrDefault(entry => entry.Username == username.Trim());

        if (user is null)
        {
            return (null, "User account was not found.", true);
        }

        var verification = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword);

        if (verification is PasswordVerificationResult.Failed)
        {
            return (null, "Current password is incorrect.", true);
        }

        user.PasswordHash = _passwordHasher.HashPassword(user, request.NewPassword);
        _db.SaveChanges();

        return (new ChangePasswordResponseDto { Token = CreateToken(user) }, null, false);
    }

    public static string HashPassword(User user, string password)
    {
        var hasher = new PasswordHasher<User>();
        return hasher.HashPassword(user, password);
    }

    private LoginResponseDto CreateLoginResponse(User user) => new()
    {
        User = ToDto(user),
        Token = CreateToken(user),
    };

    private AuthTokenDto CreateToken(User user)
    {
        var expiresAt = DateTimeOffset.UtcNow.AddMinutes(_jwtSettings.ExpireMinutes);
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSettings.Key)),
            SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Username),
            new Claim(JwtRegisteredClaimNames.Name, user.DisplayName),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };

        var token = new JwtSecurityToken(
            issuer: _jwtSettings.Issuer,
            audience: _jwtSettings.Audience,
            claims: claims,
            expires: expiresAt.UtcDateTime,
            signingCredentials: credentials);

        return new AuthTokenDto
        {
            AccessToken = new JwtSecurityTokenHandler().WriteToken(token),
            ExpiresAt = expiresAt,
        };
    }

    private static UserDto ToDto(User user) => new()
    {
        Username = user.Username,
        DisplayName = user.DisplayName,
    };
}
