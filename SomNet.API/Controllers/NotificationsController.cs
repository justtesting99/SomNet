using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SomNet.API.Services;
using SomNet.Shared.DTO.Notifications;

namespace SomNet.API.Controllers;

[Authorize]
[ApiController]
[Route("api/notifications")]
public class NotificationsController : ControllerBase
{
    private readonly ISomNetDataStore _dataStore;

    public NotificationsController(ISomNetDataStore dataStore)
    {
        _dataStore = dataStore;
    }

    [HttpPost]
    public ActionResult<SendSessionNotificationResponseDto> Send(
        [FromBody] SendSessionNotificationRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.DomTarget))
        {
            return BadRequest("domTarget is required.");
        }

        if (string.IsNullOrWhiteSpace(request.Subject))
        {
            return BadRequest("subject is required.");
        }

        var notification = _dataStore.AddNotification(request);

        return Ok(new SendSessionNotificationResponseDto
        {
            Notification = notification,
            Message = $"Notification prepared for Sub {request.SubTarget}. Email delivery will be handled by the API.",
        });
    }
}
