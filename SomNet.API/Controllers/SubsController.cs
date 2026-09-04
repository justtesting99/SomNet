using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SomNet.API.Services;
using SomNet.Shared.Enums;
using SomNet.Shared.Models;

namespace SomNet.API.Controllers;

[Authorize]
[ApiController]
[Route("api/subs")]
public class SubsController : ControllerBase
{
    private readonly ISomNetDataStore _dataStore;

    public SubsController(ISomNetDataStore dataStore)
    {
        _dataStore = dataStore;
    }

    [HttpGet]
    public ActionResult<SubsResponseDto> GetSubs([FromQuery] string domTarget)
    {
        if (string.IsNullOrWhiteSpace(domTarget))
        {
            return BadRequest("domTarget is required.");
        }

        return Ok(new SubsResponseDto
        {
            ControllerRole = SessionUserConstants.ControllerRole,
            SubRole = SessionUserConstants.SubRole,
            Subs = _dataStore.GetSubsUnderDom(domTarget),
        });
    }
}

public sealed class SubsResponseDto
{
    public required string ControllerRole { get; init; }

    public required string SubRole { get; init; }

    public required IReadOnlyList<SubTargetName> Subs { get; init; }
}
