using Microsoft.AspNetCore.Mvc;

namespace SomNet.API.Controllers;

[ApiController]
[Route("api/system")]
public class SystemStatusController : ControllerBase
{
    [HttpGet("status")]
    public IActionResult GetStatus()
    {
        // Device and SignalR status will be populated once hardware integration is implemented.
        return Ok(new
        {
            api = "online",
            device = "disconnected",
            signalR = "disconnected",
            message = "API online. Device and SignalR connection pending implementation.",
        });
    }
}
