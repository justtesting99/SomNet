using Microsoft.AspNetCore.Mvc;
using SomNet.Shared.DTO.System;
using SomNet.Shared.Enums;

namespace SomNet.API.Controllers;

[ApiController]
[Route("api/system")]
public class SystemStatusController : ControllerBase
{
    [HttpGet("status")]
    public ActionResult<SystemStatusResponseDto> GetStatus()
    {
        // Device and SignalR status will be populated once hardware integration is implemented.
        return Ok(new SystemStatusResponseDto
        {
            Api = ConnectionState.Online,
            Device = ConnectionState.Offline,
            SignalR = ConnectionState.Offline,
            Message = "API online. Device and SignalR connection pending implementation.",
        });
    }
}
