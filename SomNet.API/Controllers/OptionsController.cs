using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SomNet.API.Services;
using SomNet.Shared.DTO.Options;

namespace SomNet.API.Controllers;

[Authorize]
[ApiController]
[Route("api/options")]
public class OptionsController : ControllerBase
{
    private readonly ISomNetDataStore _dataStore;

    public OptionsController(ISomNetDataStore dataStore)
    {
        _dataStore = dataStore;
    }

    [HttpGet]
    public ActionResult<AppOptionsDto> Get([FromQuery] string username)
    {
        return Ok(_dataStore.GetOptions(username));
    }

    [HttpPut]
    public ActionResult<AppOptionsDto> Save(
        [FromQuery] string username,
        [FromBody] AppOptionsDto options)
    {
        try
        {
            return Ok(_dataStore.SaveOptions(username, options));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
    }
}
