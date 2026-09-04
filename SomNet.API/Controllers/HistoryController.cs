using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SomNet.API.Services;
using SomNet.Shared.DTO.History;
using SomNet.Shared.Enums;

namespace SomNet.API.Controllers;

[Authorize]
[ApiController]
[Route("api/history")]
public class HistoryController : ControllerBase
{
    private readonly ISomNetDataStore _dataStore;

    public HistoryController(ISomNetDataStore dataStore)
    {
        _dataStore = dataStore;
    }

    [HttpGet("timeline")]
    public ActionResult<IReadOnlyList<HistoryTimelineItemDto>> GetTimeline([FromQuery] HistoryQueryDto query)
    {
        if (string.IsNullOrWhiteSpace(query.DomTarget))
        {
            return BadRequest("domTarget is required.");
        }

        try
        {
            return Ok(_dataStore.GetTimeline(query));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpGet("sessions")]
    public ActionResult<IReadOnlyList<SessionHistoryEntryDto>> GetSessions(
        [FromQuery] string domTarget,
        [FromQuery] SubTargetName? subTarget = null)
    {
        if (string.IsNullOrWhiteSpace(domTarget))
        {
            return BadRequest("domTarget is required.");
        }

        return Ok(_dataStore.GetSessionsForDom(domTarget, subTarget));
    }
}
